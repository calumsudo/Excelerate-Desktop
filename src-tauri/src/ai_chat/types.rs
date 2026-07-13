//! Provider-agnostic chat types shared by the AI chat commands, the three
//! provider clients, and the frontend (mirrored in `src/services/ai-chat-service.ts`).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One piece of a chat message. The union covers everything the three
/// providers need: plain text, inline images/documents, and the tool-use /
/// tool-result pairs produced by the agent loop.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatBlock {
    Text {
        text: String,
    },
    /// Base64-encoded image (png/jpeg/gif/webp).
    Image {
        media_type: String,
        data: String,
    },
    /// Base64-encoded document (currently always application/pdf).
    Document {
        media_type: String,
        data: String,
        name: String,
    },
    /// A tool call requested by the assistant.
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    /// The result for one tool call, sent back in a user-role message.
    ToolResult {
        tool_use_id: String,
        name: String,
        content: String,
        is_error: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// "user" or "assistant".
    pub role: String,
    pub blocks: Vec<ChatBlock>,
}

/// Everything the frontend sends for one turn. The Rust side is stateless:
/// the full history comes in, the newly generated messages go back out.
#[derive(Debug, Clone, Deserialize)]
pub struct AiChatRequest {
    /// "anthropic" | "openai" | "google".
    pub provider: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub supabase_access_token: String,
}

/// Live streaming events pushed to the frontend over a Tauri channel while a
/// turn is in flight. The canonical messages are returned by the command.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AiChatEvent {
    TextDelta {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        input: Value,
    },
    ToolResult {
        id: String,
        name: String,
        preview: String,
        is_error: bool,
    },
    /// One assistant API turn finished (more may follow after tool calls).
    TurnComplete,
}

/// Callback used by provider clients to surface streaming events.
pub type EventSink<'a> = &'a mut (dyn FnMut(AiChatEvent) + Send);

/// A tool exposed to the model. `input_schema` is a plain JSON Schema object
/// kept to the subset all three providers accept.
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
}

/// The blocks of one completed assistant turn (text + tool calls).
pub struct AssistantTurn {
    pub blocks: Vec<ChatBlock>,
}
