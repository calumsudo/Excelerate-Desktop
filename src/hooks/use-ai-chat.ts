import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import {
  apiKeyFor,
  getAiSettings,
  modelFor,
  prepareChatAttachment,
  PROVIDER_LABELS,
  providerNeedsApiKey,
  streamChat,
  type AiChatEvent,
  type AiProvider,
  type AiSettings,
  type ChatBlock,
  type ChatMessage,
  type PreparedAttachment,
} from "@services/ai-chat-service";
import {
  appendMessages,
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  replaceMessages,
  type Conversation,
} from "@services/chat-store-service";
import { toast } from "@services/toast-service";
import { type LiveSegment } from "@components/ai-chat/chat-message-view";
import { isToolResultMessage } from "@components/ai-chat/message-utils";

const ATTACHMENT_EXTENSIONS = [
  "csv",
  "tsv",
  "txt",
  "md",
  "json",
  "xlsx",
  "xls",
  "xlsm",
  "xlsb",
  "ods",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
];

function titleFrom(text: string, fallback: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

/**
 * A prepared attachment plus a client-generated id, so the pending-attachment
 * chips have a stable key while the user adds and removes them before sending.
 */
interface LocalAttachment extends PreparedAttachment {
  id: string;
}

/**
 * Owns all AI-chat state and side effects: settings, the conversation list,
 * the active message thread, the composer, attachments, and streaming. Kept
 * out of the page component so the page is pure presentation.
 */
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- these hold largely independent concerns (settings, conversation list, active messages, composer input, attachments, streaming status) that change at different times, so a single reducer would not improve consistency
export function useAiChat() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [liveSegments, setLiveSegments] = useState<LiveSegment[]>([]);

  // Persistence degrades gracefully until the chat tables exist in Supabase.
  const persistenceBroken = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAiSettings()
      .then((loaded) => {
        setSettings(loaded);
        setProvider(loaded.default_provider);
        setModel(modelFor(loaded, loaded.default_provider));
      })
      .catch((error) => toast.error("Failed to load AI settings", String(error)));

    listConversations()
      .then(setConversations)
      .catch(() => {
        persistenceBroken.current = true;
      });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, liveSegments]);

  const warnPersistence = (error: unknown) => {
    if (!persistenceBroken.current) {
      persistenceBroken.current = true;
      toast.warning(
        "Chat history is not being saved",
        `Conversations will work but won't persist: ${String(error)}`
      );
    }
  };

  const handleProviderChange = (next: AiProvider) => {
    setProvider(next);
    if (settings) setModel(modelFor(settings, next));
  };

  const handleNewChat = () => {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    if (streaming || conversation.id === activeId) return;
    setActiveId(conversation.id);
    if (conversation.provider in PROVIDER_LABELS) {
      setProvider(conversation.provider as AiProvider);
    }
    if (conversation.model) setModel(conversation.model);
    try {
      setMessages(await listMessages(conversation.id));
    } catch (error) {
      setMessages([]);
      warnPersistence(error);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) handleNewChat();
    } catch (error) {
      toast.error("Failed to delete conversation", String(error));
    }
  };

  const handleAttach = async () => {
    setAttaching(true);
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Documents & data", extensions: ATTACHMENT_EXTENSIONS }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      // The picks are independent, so prepare them together instead of
      // awaiting each one in turn.
      const prepared = await Promise.all(paths.map((path) => prepareChatAttachment(path)));
      const withIds: LocalAttachment[] = prepared.map((attachment) => ({
        ...attachment,
        id: crypto.randomUUID(),
      }));
      setAttachments((prev) => [...prev, ...withIds]);
    } catch (error) {
      toast.error("Could not attach file", String(error));
    } finally {
      setAttaching(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const onEvent = useCallback((event: AiChatEvent) => {
    setLiveSegments((prev) => {
      if (event.type === "text_delta") {
        const last = prev[prev.length - 1];
        if (last?.type === "text") {
          return [...prev.slice(0, -1), { type: "text", text: last.text + event.text }];
        }
        return [...prev, { type: "text", text: event.text }];
      }
      if (event.type === "tool_call") {
        return [...prev, { type: "tool", id: event.id, name: event.name, status: "running" }];
      }
      if (event.type === "tool_result") {
        return prev.map((segment) =>
          segment.type === "tool" && segment.id === event.id
            ? { ...segment, status: event.is_error ? "error" : "done" }
            : segment
        );
      }
      return prev;
    });
  }, []);

  /** Validates provider/model setup, surfacing a toast and returning false if not ready. */
  const ensureConfigured = (): boolean => {
    if (!settings || (providerNeedsApiKey(provider) && !apiKeyFor(settings, provider))) {
      toast.warning(
        "No API key configured",
        `Add your ${PROVIDER_LABELS[provider]} API key in the AI settings first.`
      );
      setSettingsOpen(true);
      return false;
    }
    if (!model.trim()) {
      const hint =
        provider === "lmstudio"
          ? "Enter the model id loaded in LM Studio (settings or the header field)."
          : "Enter a model id in the header first.";
      toast.warning("No model set", hint);
      if (provider === "lmstudio") setSettingsOpen(true);
      return false;
    }
    return true;
  };

  /** Moves a conversation to the top of the list after a new turn. */
  const bumpConversation = (id: string) => {
    setConversations((prev) => {
      const bumped = prev.find((c) => c.id === id);
      if (!bumped) return prev;
      return [bumped, ...prev.filter((c) => c.id !== id)];
    });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (streaming || (!text && attachments.length === 0)) return;
    if (!ensureConfigured()) return;

    const blocks: ChatBlock[] = [
      ...attachments.flatMap((attachment) => attachment.blocks),
      ...(text ? [{ kind: "text", text } as ChatBlock] : []),
    ];
    const userMessage: ChatMessage = { role: "user", blocks };
    const history = [...messages, userMessage];

    setMessages(history);
    setInput("");
    setAttachments([]);
    setStreaming(true);
    setLiveSegments([]);

    // Persist the user message (creating the conversation on first send).
    let conversationId = activeId;
    if (!persistenceBroken.current) {
      try {
        if (!conversationId) {
          const conversation = await createConversation(
            titleFrom(text, attachments[0]?.name ?? "New chat"),
            provider,
            model
          );
          conversationId = conversation.id;
          setActiveId(conversation.id);
          setConversations((prev) => [conversation, ...prev]);
        }
        await appendMessages(conversationId, [userMessage]);
      } catch (error) {
        warnPersistence(error);
      }
    }

    try {
      const newMessages = await streamChat({ provider, model, messages: history, onEvent });
      setMessages([...history, ...newMessages]);
      if (!persistenceBroken.current && conversationId) {
        try {
          await appendMessages(conversationId, newMessages);
          bumpConversation(conversationId);
        } catch (error) {
          warnPersistence(error);
        }
      }
    } catch (error) {
      toast.error("AI request failed", String(error));
    } finally {
      setStreaming(false);
      setLiveSegments([]);
    }
  };

  /**
   * Regenerates the assistant turn that produced `messages[index]`. Everything
   * from the start of that turn onward is dropped and re-streamed from the
   * user prompt that triggered it.
   */
  const handleRetry = async (index: number) => {
    if (streaming || !ensureConfigured()) return;

    // Walk back to the genuine user prompt that started this assistant turn,
    // skipping the assistant messages and tool-result plumbing in between.
    let cut = index;
    while (cut > 0) {
      const prev = messages[cut - 1];
      if (prev.role === "user" && !isToolResultMessage(prev)) break;
      cut--;
    }
    const history = messages.slice(0, cut);
    if (history.length === 0) return;

    const previousMessages = messages;
    setMessages(history);
    setStreaming(true);
    setLiveSegments([]);

    try {
      const newMessages = await streamChat({ provider, model, messages: history, onEvent });
      const finalMessages = [...history, ...newMessages];
      setMessages(finalMessages);
      if (!persistenceBroken.current && activeId) {
        try {
          await replaceMessages(activeId, finalMessages);
          bumpConversation(activeId);
        } catch (error) {
          warnPersistence(error);
        }
      }
    } catch (error) {
      toast.error("AI request failed", String(error));
      setMessages(previousMessages); // restore the response we tried to replace
    } finally {
      setStreaming(false);
      setLiveSegments([]);
    }
  };

  const onSettingsSaved = (saved: AiSettings) => {
    setSettings(saved);
    setModel(modelFor(saved, provider));
  };

  const needsSetup = settings
    ? providerNeedsApiKey(provider) && !apiKeyFor(settings, provider)
    : true;

  return {
    settings,
    provider,
    model,
    setModel,
    settingsOpen,
    setSettingsOpen,
    conversations,
    activeId,
    messages,
    input,
    setInput,
    attachments,
    removeAttachment,
    attaching,
    streaming,
    liveSegments,
    scrollRef,
    needsSetup,
    handleProviderChange,
    handleNewChat,
    handleSelectConversation,
    handleDeleteConversation,
    handleAttach,
    handleSend,
    handleRetry,
    onSettingsSaved,
  };
}
