import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Chip,
  Input,
  ScrollShadow,
  Select,
  SelectItem,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { Icon } from "@iconify/react";
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
import {
  LiveMessageView,
  MessageView,
  type LiveSegment,
} from "@components/ai-chat/chat-message-view";
import { isToolResultMessage } from "@components/ai-chat/message-utils";
import { ProviderSettingsModal } from "@components/ai-chat/provider-settings-modal";

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

function AiChat() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
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
      for (const path of paths) {
        const prepared = await prepareChatAttachment(path);
        setAttachments((prev) => [...prev, prepared]);
      }
    } catch (error) {
      toast.error("Could not attach file", String(error));
    } finally {
      setAttaching(false);
    }
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

  const needsSetup = settings
    ? providerNeedsApiKey(provider) && !apiKeyFor(settings, provider)
    : true;

  return (
    <div className="flex h-full gap-4">
      {/* Conversation list */}
      <div className="flex w-64 shrink-0 flex-col gap-2 border-r border-divider pr-4">
        <Button
          color="primary"
          variant="flat"
          startContent={<Icon icon="solar:pen-new-square-outline" width={18} />}
          onPress={handleNewChat}
          isDisabled={streaming}
        >
          New chat
        </Button>
        <ScrollShadow className="flex-1">
          <div className="flex flex-col gap-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group flex items-center gap-1 rounded-medium px-2 py-2 text-small hover:bg-default-100 ${
                  conversation.id === activeId ? "bg-default-100 font-medium" : ""
                }`}
              >
                <button
                  type="button"
                  className="flex-1 cursor-pointer truncate text-left"
                  onClick={() => handleSelectConversation(conversation)}
                >
                  {conversation.title}
                </button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  className="opacity-0 group-hover:opacity-100"
                  onPress={() => handleDeleteConversation(conversation.id)}
                  isDisabled={streaming}
                  aria-label="Delete conversation"
                >
                  <Icon icon="solar:trash-bin-trash-outline" width={16} />
                </Button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="px-2 py-4 text-tiny text-default-400">No conversations yet.</p>
            )}
          </div>
        </ScrollShadow>
      </div>

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 pb-3">
          <h1 className="flex-1 text-xl font-semibold">AI Chat</h1>
          <Select
            size="sm"
            className="w-48"
            aria-label="AI provider"
            selectedKeys={[provider]}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0] as AiProvider | undefined;
              if (key) handleProviderChange(key);
            }}
            isDisabled={streaming}
          >
            {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((key) => (
              <SelectItem key={key}>{PROVIDER_LABELS[key]}</SelectItem>
            ))}
          </Select>
          <Input
            size="sm"
            className="w-52"
            aria-label="Model"
            value={model}
            onValueChange={setModel}
            isDisabled={streaming}
          />
          <Tooltip content="AI provider settings">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => setSettingsOpen(true)}
              aria-label="AI settings"
            >
              <Icon icon="solar:settings-outline" width={20} />
            </Button>
          </Tooltip>
        </div>

        <ScrollShadow ref={scrollRef} className="flex-1 pr-2">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-4">
            {messages.length === 0 && !streaming && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Icon
                  icon="solar:chat-round-line-duotone"
                  width={48}
                  className="text-default-300"
                />
                <p className="text-default-500">
                  Ask about your portfolios — deals, vintages, payments, allocations.
                </p>
                <p className="max-w-md text-tiny text-default-400">
                  The assistant queries your Supabase data with read-only tools and can analyze CSV,
                  Excel and PDF files you attach.
                </p>
                {needsSetup && (
                  <Button size="sm" variant="flat" onPress={() => setSettingsOpen(true)}>
                    Configure API keys
                  </Button>
                )}
              </div>
            )}
            {messages.map((message, i) => (
              <MessageView
                key={i}
                message={message}
                onRetry={
                  !streaming && message.role === "assistant" && i === messages.length - 1
                    ? () => handleRetry(i)
                    : undefined
                }
              />
            ))}
            {streaming && <LiveMessageView segments={liveSegments} />}
          </div>
        </ScrollShadow>

        {/* Composer */}
        <div className="mx-auto w-full max-w-3xl pt-3">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment, i) => (
                <Chip
                  key={i}
                  size="sm"
                  variant="flat"
                  color="secondary"
                  onClose={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                >
                  {attachment.name}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Tooltip content="Attach CSV, Excel, PDF or image files">
              <Button
                isIconOnly
                variant="flat"
                onPress={handleAttach}
                isLoading={attaching}
                isDisabled={streaming}
                aria-label="Attach file"
              >
                <Icon icon="solar:paperclip-outline" width={20} />
              </Button>
            </Tooltip>
            <Textarea
              minRows={1}
              maxRows={8}
              placeholder="Ask about your portfolio data…"
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              isDisabled={streaming}
            />
            <Button
              isIconOnly
              color="primary"
              onPress={handleSend}
              isLoading={streaming}
              isDisabled={!input.trim() && attachments.length === 0}
              aria-label="Send message"
            >
              <Icon icon="solar:plain-2-outline" width={20} />
            </Button>
          </div>
        </div>
      </div>

      {settings && (
        <ProviderSettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSaved={(saved) => {
            setSettings(saved);
            setModel(modelFor(saved, provider));
          }}
        />
      )}
    </div>
  );
}

export default AiChat;
