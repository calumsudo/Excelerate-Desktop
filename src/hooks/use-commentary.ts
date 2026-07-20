import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir } from "@tauri-apps/api/path";

import {
  apiKeyFor,
  getAiSettings,
  modelFor,
  PROVIDER_LABELS,
  providerNeedsApiKey,
  type AiChatEvent,
  type AiSettings,
} from "@services/ai-chat-service";
import {
  buildCommentaryPrompt,
  commentaryMonths,
  generateCommentary,
  loadCommentarySeed,
  type CommentarySeed,
} from "@services/commentary-service";
import type { PortfolioOption, PortfolioSelection } from "@services/analytics-service";
import { toast } from "@services/toast-service";
import type { LiveSegment } from "@components/ai-chat/chat-message-view";

/**
 * Owns all monthly-commentary state and side effects: the scope/month pick,
 * seed-data loading, AI settings, generation streaming, and the draft with
 * copy/export. The modal component stays pure presentation. The caller
 * remounts the modal (via a React key) on each open, so initial state comes
 * from `initialSelection` with no reset-on-prop-change effects.
 */
export function useCommentary({
  isOpen,
  portfolios,
  initialSelection,
}: {
  isOpen: boolean;
  portfolios: PortfolioOption[];
  initialSelection: PortfolioSelection | null;
}) {
  const [selection, setSelection] = useState<PortfolioSelection>(initialSelection ?? "all");
  const [seed, setSeed] = useState<CommentarySeed | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [month, setMonth] = useState<string | null>(null);

  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [liveSegments, setLiveSegments] = useState<LiveSegment[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scopeLabel = useMemo(() => {
    if (selection === "all") return "All Portfolios";
    return portfolios.find((p) => p.id === selection)?.name ?? "Portfolio";
  }, [selection, portfolios]);

  useEffect(() => {
    if (!isOpen) return;
    getAiSettings()
      .then(setSettings)
      .catch((error) => toast.error("Failed to load AI settings", String(error)));
  }, [isOpen]);

  // (Re)load the seed data whenever the scope changes while open.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSeedLoading(true);
    setSeed(null);
    setMonth(null);
    loadCommentarySeed(selection, scopeLabel)
      .then((loaded) => {
        if (cancelled) return;
        setSeed(loaded);
        setMonth(commentaryMonths(loaded)[0] ?? null);
      })
      .catch((error) => {
        if (!cancelled) toast.error("Failed to load portfolio data", String(error));
      })
      .finally(() => {
        if (!cancelled) setSeedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selection, scopeLabel]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [liveSegments]);

  const provider = settings?.default_provider ?? "anthropic";
  const model = settings ? modelFor(settings, provider) : "";
  const needsSetup =
    !settings || (providerNeedsApiKey(provider) && !apiKeyFor(settings, provider)) || !model.trim();

  const months = seed ? commentaryMonths(seed) : [];

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

  const handleGenerate = async () => {
    if (!seed || !month || generating) return;
    if (needsSetup) {
      toast.warning(
        "No AI provider configured",
        `Add your ${PROVIDER_LABELS[provider]} API key and model first.`
      );
      setSettingsOpen(true);
      return;
    }

    setGenerating(true);
    setDraft(null);
    setLiveSegments([]);
    try {
      const prompt = buildCommentaryPrompt(seed, month);
      const text = await generateCommentary({ provider, model, prompt, onEvent });
      setDraft(text);
    } catch (error) {
      toast.error("Commentary generation failed", String(error));
    } finally {
      setGenerating(false);
      setLiveSegments([]);
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently; nothing actionable for the user.
    }
  };

  const handleExport = async () => {
    if (!draft || !month) return;
    try {
      const name = `${scopeLabel.replace(/\s+/g, "_")}_Commentary_${month}.md`;
      const filePath = await save({
        defaultPath: `${await downloadDir()}/${name}`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, draft);
      toast.success("Commentary exported", filePath);
    } catch (error) {
      toast.error("Export failed", String(error));
    }
  };

  return {
    selection,
    setSelection,
    seed,
    seedLoading,
    month,
    setMonth,
    months,
    settings,
    setSettings,
    settingsOpen,
    setSettingsOpen,
    provider,
    model,
    needsSetup,
    generating,
    liveSegments,
    draft,
    setDraft,
    copied,
    scrollRef,
    handleGenerate,
    handleCopy,
    handleExport,
  };
}
