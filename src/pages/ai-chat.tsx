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

import { PROVIDER_LABELS, type AiProvider } from "@services/ai-chat-service";
import { LiveMessageView, MessageView } from "@components/ai-chat/chat-message-view";
import { ProviderSettingsModal } from "@components/ai-chat/provider-settings-modal";
import { useAiChat } from "@/hooks/use-ai-chat";

function AiChat() {
  const {
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
  } = useAiChat();

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
              // react-doctor-disable-next-line react-doctor/no-array-index-as-key -- the conversation log is append-only and only ever truncated from the end (retry), so it never reorders or filters mid-list
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
              {attachments.map((attachment) => (
                <Chip
                  key={attachment.id}
                  size="sm"
                  variant="flat"
                  color="secondary"
                  onClose={() => removeAttachment(attachment.id)}
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
          onSaved={onSettingsSaved}
        />
      )}
    </div>
  );
}

export default AiChat;
