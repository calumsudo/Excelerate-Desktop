import type { RefObject } from "react";
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

import { PROVIDER_LABELS } from "@services/ai-chat-service";
import { formatMonthLong } from "@services/commentary-service";
import type { PortfolioOption, PortfolioSelection } from "@services/analytics-service";
import { LiveMessageView, Markdown, type LiveSegment } from "@components/ai-chat/chat-message-view";
import { ProviderSettingsModal } from "@components/ai-chat/provider-settings-modal";
import { useCommentary } from "@/hooks/use-commentary";

const ALL_KEY = "all";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  portfolios: PortfolioOption[];
  /**
   * The dashboard's scope when the modal opened. The dashboard remounts the
   * modal (React key) on each open, so this only needs to be right at mount.
   */
  initialSelection: PortfolioSelection | null;
}

/** The pickers + Generate row and the provider indicator. */
function ScopeBar({
  portfolios,
  commentary,
}: {
  portfolios: PortfolioOption[];
  commentary: ReturnType<typeof useCommentary>;
}) {
  const c = commentary;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        label="Portfolio"
        size="sm"
        className="w-52"
        selectedKeys={[c.selection === "all" ? ALL_KEY : String(c.selection)]}
        onSelectionChange={(keys) => {
          const key = Array.from(keys)[0];
          if (key == null) return;
          c.setSelection(key === ALL_KEY ? "all" : Number(key));
        }}
        isDisabled={c.generating}
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
        placeholder={c.seedLoading ? "Loading…" : "No data"}
        selectedKeys={c.month ? [c.month] : []}
        onSelectionChange={(keys) => {
          const key = Array.from(keys)[0];
          if (key != null) c.setMonth(String(key));
        }}
        isDisabled={c.generating || c.seedLoading || c.months.length === 0}
      >
        {c.months.map((m) => (
          <SelectItem key={m}>{formatMonthLong(m)}</SelectItem>
        ))}
      </Select>
      <Button
        color="primary"
        startContent={!c.generating && <Icon icon="solar:magic-stick-3-outline" width={18} />}
        onPress={c.handleGenerate}
        isLoading={c.generating}
        isDisabled={c.seedLoading || !c.seed || !c.month}
      >
        {c.draft ? "Regenerate" : "Generate"}
      </Button>
      <div className="flex flex-1 items-center justify-end gap-1">
        <span className="text-tiny text-default-400">
          {c.needsSetup
            ? "AI provider not configured"
            : `${PROVIDER_LABELS[c.provider]} · ${c.model}`}
        </span>
        <Tooltip content="AI provider settings">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => c.setSettingsOpen(true)}
            aria-label="AI settings"
          >
            <Icon icon="solar:settings-outline" width={18} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

/** The output area: live stream while generating, then Preview/Edit tabs. */
function CommentaryOutput({
  generating,
  liveSegments,
  scrollRef,
  draft,
  setDraft,
  seedLoading,
}: {
  generating: boolean;
  liveSegments: LiveSegment[];
  scrollRef: RefObject<HTMLDivElement | null>;
  draft: string | null;
  setDraft: (draft: string) => void;
  seedLoading: boolean;
}) {
  if (generating) {
    return (
      <ScrollShadow
        ref={scrollRef}
        className="max-h-[50vh] rounded-medium border border-default-200 p-4"
      >
        <LiveMessageView segments={liveSegments} />
      </ScrollShadow>
    );
  }

  if (draft != null) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-medium border border-dashed border-default-200 py-10 text-center">
      {seedLoading ? (
        <Spinner size="sm" label="Loading portfolio data…" labelColor="foreground" />
      ) : (
        <>
          <Icon icon="solar:document-add-outline" width={36} className="text-default-300" />
          <p className="max-w-md text-small text-default-500">
            Drafts LP-letter commentary for the selected month — portfolio overview, vintage
            performance, collections vs. prior month, notable deals and concentration — from your
            live portfolio data.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * "Generate monthly commentary" (issue #59): portfolio + month pickers, the
 * streamed draft, then an editable markdown result with copy/export.
 */
export function CommentaryModal({ isOpen, onClose, portfolios, initialSelection }: Props) {
  const commentary = useCommentary({ isOpen, portfolios, initialSelection });
  const { generating, liveSegments, scrollRef, draft, setDraft, seedLoading, copied } = commentary;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Icon icon="solar:document-text-outline" width={20} />
            Monthly Commentary
          </ModalHeader>
          <ModalBody className="gap-4">
            <ScopeBar portfolios={portfolios} commentary={commentary} />
            <CommentaryOutput
              generating={generating}
              liveSegments={liveSegments}
              scrollRef={scrollRef}
              draft={draft}
              setDraft={setDraft}
              seedLoading={seedLoading}
            />
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
                  onPress={commentary.handleCopy}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="flat"
                  startContent={<Icon icon="solar:download-outline" width={16} />}
                  onPress={commentary.handleExport}
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

      {commentary.settings && (
        <ProviderSettingsModal
          isOpen={commentary.settingsOpen}
          onClose={() => commentary.setSettingsOpen(false)}
          settings={commentary.settings}
          onSaved={commentary.setSettings}
        />
      )}
    </>
  );
}

export default CommentaryModal;
