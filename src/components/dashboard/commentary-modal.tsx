import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Select,
  SelectItem,
  Spinner,
  Tab,
  Tabs,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { Icon } from "@iconify/react";
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
  formatMonthLong,
  generateCommentary,
  loadCommentarySeed,
  type CommentarySeed,
} from "@services/commentary-service";
import type { PortfolioOption, PortfolioSelection } from "@services/analytics-service";
import { toast } from "@services/toast-service";
import { LiveMessageView, Markdown, type LiveSegment } from "@components/ai-chat/chat-message-view";
import { ProviderSettingsModal } from "@components/ai-chat/provider-settings-modal";

const ALL_KEY = "all";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  portfolios: PortfolioOption[];
  /** The dashboard's current scope, used as the initial pick. */
  initialSelection: PortfolioSelection | null;
}

/**
 * "Generate monthly commentary" (issue #59): portfolio + month pickers, the
 * streamed draft, then an editable markdown result with copy/export.
 */
export function CommentaryModal({ isOpen, onClose, portfolios, initialSelection }: Props) {
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

  // Reset to the dashboard's scope each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setSelection(initialSelection ?? "all");
      setDraft(null);
      setLiveSegments([]);
    }
  }, [isOpen, initialSelection]);

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

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Icon icon="solar:document-text-outline" width={20} />
            Monthly Commentary
          </ModalHeader>
          <ModalBody className="gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <Select
                label="Portfolio"
                size="sm"
                className="w-52"
                selectedKeys={[selection === "all" ? ALL_KEY : String(selection)]}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  if (key == null) return;
                  setSelection(key === ALL_KEY ? "all" : Number(key));
                }}
                isDisabled={generating}
              >
                {[
                  <SelectItem key={ALL_KEY}>All Portfolios</SelectItem>,
                  ...portfolios.map((p) => <SelectItem key={String(p.id)}>{p.name}</SelectItem>),
                ]}
              </Select>
              <Select
                label="Month"
                size="sm"
                className="w-44"
                placeholder={seedLoading ? "Loading…" : "No data"}
                selectedKeys={month ? [month] : []}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  if (key != null) setMonth(String(key));
                }}
                isDisabled={generating || seedLoading || months.length === 0}
              >
                {months.map((m) => (
                  <SelectItem key={m}>{formatMonthLong(m)}</SelectItem>
                ))}
              </Select>
              <Button
                color="primary"
                startContent={!generating && <Icon icon="solar:magic-stick-3-outline" width={18} />}
                onPress={handleGenerate}
                isLoading={generating}
                isDisabled={seedLoading || !seed || !month}
              >
                {draft ? "Regenerate" : "Generate"}
              </Button>
              <div className="flex flex-1 items-center justify-end gap-1">
                <span className="text-tiny text-default-400">
                  {needsSetup
                    ? "AI provider not configured"
                    : `${PROVIDER_LABELS[provider]} · ${model}`}
                </span>
                <Tooltip content="AI provider settings">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => setSettingsOpen(true)}
                    aria-label="AI settings"
                  >
                    <Icon icon="solar:settings-outline" width={18} />
                  </Button>
                </Tooltip>
              </div>
            </div>

            {generating && (
              <ScrollShadow
                ref={scrollRef}
                className="max-h-[50vh] rounded-medium border border-default-200 p-4"
              >
                <LiveMessageView segments={liveSegments} />
              </ScrollShadow>
            )}

            {!generating && draft != null && (
              <Tabs aria-label="Commentary view" size="sm">
                <Tab key="preview" title="Preview">
                  <ScrollShadow className="max-h-[50vh] rounded-medium border border-default-200 p-4">
                    <Markdown text={draft} />
                  </ScrollShadow>
                </Tab>
                <Tab key="edit" title="Edit">
                  <Textarea
                    aria-label="Edit commentary markdown"
                    value={draft}
                    onValueChange={setDraft}
                    minRows={14}
                    maxRows={22}
                    classNames={{ input: "font-mono text-xs" }}
                  />
                </Tab>
              </Tabs>
            )}

            {!generating && draft == null && (
              <div className="flex flex-col items-center gap-2 rounded-medium border border-dashed border-default-200 py-10 text-center">
                {seedLoading ? (
                  <Spinner size="sm" label="Loading portfolio data…" labelColor="foreground" />
                ) : (
                  <>
                    <Icon
                      icon="solar:document-add-outline"
                      width={36}
                      className="text-default-300"
                    />
                    <p className="max-w-md text-small text-default-500">
                      Drafts LP-letter commentary for the selected month — portfolio overview,
                      vintage performance, collections vs. prior month, notable deals and
                      concentration — from your live portfolio data.
                    </p>
                  </>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            {draft != null && !generating && (
              <>
                <Button
                  variant="flat"
                  startContent={
                    <Icon
                      icon={copied ? "solar:check-read-outline" : "solar:copy-outline"}
                      width={16}
                    />
                  }
                  onPress={handleCopy}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="flat"
                  startContent={<Icon icon="solar:download-outline" width={16} />}
                  onPress={handleExport}
                >
                  Export .md
                </Button>
              </>
            )}
            <Button variant="light" onPress={onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {settings && (
        <ProviderSettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSaved={setSettings}
        />
      )}
    </>
  );
}

export default CommentaryModal;
