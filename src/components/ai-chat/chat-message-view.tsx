import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Chip, Spinner, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { ChatBlock, ChatMessage } from "@services/ai-chat-service";
import { isToolResultMessage } from "./message-utils";

/** react-markdown passes a `node` prop that must not reach the DOM. */
function strip<T extends { node?: unknown }>(props: T) {
  const { node: _ignored, ...rest } = props;
  void _ignored;
  return rest;
}

const markdownComponents: Components = {
  p: (props) => <p className="mb-2 last:mb-0" {...strip(props)} />,
  ul: (props) => <ul className="mb-2 list-disc pl-5" {...strip(props)} />,
  ol: (props) => <ol className="mb-2 list-decimal pl-5" {...strip(props)} />,
  li: (props) => <li className="mb-0.5" {...strip(props)} />,
  h1: (props) => <h1 className="mb-2 mt-3 text-lg font-bold first:mt-0" {...strip(props)} />,
  h2: (props) => <h2 className="mb-2 mt-3 text-base font-bold first:mt-0" {...strip(props)} />,
  h3: (props) => <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0" {...strip(props)} />,
  a: (props) => (
    <a className="text-primary underline" target="_blank" rel="noreferrer" {...strip(props)} />
  ),
  table: (props) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...strip(props)} />
    </div>
  ),
  th: (props) => (
    <th
      className="border border-default-300 bg-default-100 px-2 py-1 text-left font-semibold"
      {...strip(props)}
    />
  ),
  td: (props) => <td className="border border-default-200 px-2 py-1" {...strip(props)} />,
  pre: (props) => (
    <pre
      className="mb-2 overflow-x-auto rounded-medium bg-default-100 p-3 text-xs"
      {...strip(props)}
    />
  ),
  code: (props) => <code className="rounded bg-default-100 px-1 text-xs" {...strip(props)} />,
  blockquote: (props) => (
    <blockquote className="mb-2 border-l-2 border-default-300 pl-3" {...strip(props)} />
  ),
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-small leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

const ATTACHMENT_TEXT_RE = /^Contents of uploaded file "(.+?)":/;

function ToolChip({ name, detail, isError }: { name: string; detail?: string; isError?: boolean }) {
  return (
    <Chip
      size="sm"
      variant="flat"
      color={isError ? "danger" : "default"}
      startContent={<Icon icon="solar:database-outline" width={14} />}
      className="max-w-full"
    >
      <span className="font-mono text-tiny">
        {name}
        {detail ? ` ${detail}` : ""}
      </span>
    </Chip>
  );
}

function summarizeToolInput(input: unknown): string {
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.relation === "string") return `· ${record.relation}`;
  }
  return "";
}

function UserBlock({ block }: { block: ChatBlock }) {
  if (block.kind === "text") {
    const attachment = block.text.match(ATTACHMENT_TEXT_RE);
    if (attachment) {
      return (
        <Chip
          size="sm"
          variant="flat"
          color="secondary"
          startContent={<Icon icon="solar:paperclip-outline" width={14} />}
        >
          {attachment[1]}
        </Chip>
      );
    }
    return <p className="whitespace-pre-wrap text-small">{block.text}</p>;
  }
  if (block.kind === "image") {
    return (
      <img
        src={`data:${block.media_type};base64,${block.data}`}
        alt="Attachment"
        className="max-h-48 rounded-medium"
      />
    );
  }
  if (block.kind === "document") {
    return (
      <Chip
        size="sm"
        variant="flat"
        color="secondary"
        startContent={<Icon icon="solar:document-outline" width={14} />}
      >
        {block.name}
      </Chip>
    );
  }
  return null;
}

function AssistantBlock({ block }: { block: ChatBlock }) {
  if (block.kind === "text") return <Markdown text={block.text} />;
  if (block.kind === "tool_use") {
    return (
      <div>
        <ToolChip name={block.name} detail={summarizeToolInput(block.input)} />
      </div>
    );
  }
  return null;
}

/** Concatenated text of an assistant message, for copying to the clipboard. */
function assistantText(message: ChatMessage): string {
  return message.blocks
    .filter((block): block is Extract<ChatBlock, { kind: "text" }> => block.kind === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

function MessageActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently; nothing actionable for the user.
    }
  };

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {text && (
        <Tooltip content={copied ? "Copied" : "Copy"}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={handleCopy}
            aria-label="Copy response"
          >
            <Icon
              icon={copied ? "solar:check-read-outline" : "solar:copy-outline"}
              width={16}
              className={copied ? "text-success" : "text-default-500"}
            />
          </Button>
        </Tooltip>
      )}
      {onRetry && (
        <Tooltip content="Retry">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={onRetry}
            aria-label="Retry response"
          >
            <Icon icon="solar:refresh-outline" width={16} className="text-default-500" />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

export function MessageView({
  message,
  onRetry,
}: {
  message: ChatMessage;
  /** When provided, renders a Retry button that regenerates this response. */
  onRetry?: () => void;
}) {
  if (isToolResultMessage(message)) {
    return null; // tool activity is already shown via the assistant's chips
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[75%] flex-col items-end gap-1 rounded-large bg-primary-50 px-4 py-2">
          {message.blocks.map((block, i) => (
            // react-doctor-disable-next-line react-doctor/no-array-index-as-key -- a message's blocks are fixed at creation and never reorder or filter, so the position is a stable key
            <UserBlock key={i} block={block} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex justify-start">
      <div className="flex max-w-[85%] flex-col gap-2">
        {message.blocks.map((block, i) => (
          // react-doctor-disable-next-line react-doctor/no-array-index-as-key -- a message's blocks are fixed at creation and never reorder or filter, so the position is a stable key
          <AssistantBlock key={i} block={block} />
        ))}
        <MessageActions text={assistantText(message)} onRetry={onRetry} />
      </div>
    </div>
  );
}

export type LiveSegment =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; status: "running" | "done" | "error" };

function LiveSegmentItem({ segment }: { segment: LiveSegment }) {
  if (segment.type === "text") return <Markdown text={segment.text} />;
  return (
    <div className="flex items-center gap-2">
      <ToolChip name={segment.name} isError={segment.status === "error"} />
      {segment.status === "running" && <Spinner size="sm" />}
    </div>
  );
}

export function LiveMessageView({ segments }: { segments: LiveSegment[] }) {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[85%] flex-col gap-2">
        {segments.map((segment, i) => (
          // react-doctor-disable-next-line react-doctor/no-array-index-as-key -- streamed segments are appended in order and never reorder or filter, so the position is a stable key
          <LiveSegmentItem key={i} segment={segment} />
        ))}
        {segments.length === 0 && <Spinner size="sm" label="Thinking…" labelColor="foreground" />}
      </div>
    </div>
  );
}
