import type { ChatMessage } from "@services/ai-chat-service";

/** True when a user-role message only carries tool results (loop plumbing). */
export function isToolResultMessage(message: ChatMessage): boolean {
  return (
    message.role === "user" &&
    message.blocks.length > 0 &&
    message.blocks.every((block) => block.kind === "tool_result")
  );
}
