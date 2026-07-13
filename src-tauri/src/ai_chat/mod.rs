//! Provider-agnostic AI chat: streams one conversational turn, running the
//! tool loop (model → database tools → model) until the assistant answers
//! without tool calls. The frontend owns history and persistence; this side
//! is stateless per invocation.

mod anthropic;
pub mod attachments;
mod gemini;
mod openai;
pub mod settings;
mod sse;
mod tools;
mod types;

use tauri::ipc::Channel;

use tools::SupabaseCtx;
use types::{AiChatEvent, AiChatRequest, AssistantTurn, ChatBlock, ChatMessage, ToolDef};

/// Safety cap on model↔tool round-trips within one user turn.
const MAX_TOOL_ROUNDS: usize = 8;
const TOOL_PREVIEW_CHARS: usize = 400;

/// Everything that stays constant across the tool rounds of one user turn.
struct TurnCtx<'a> {
    provider: &'a str,
    client: &'a reqwest::Client,
    api_key: &'a str,
    model: &'a str,
    system: &'a str,
    tools: &'a [ToolDef],
}

impl TurnCtx<'_> {
    async fn run(
        &self,
        messages: &[ChatMessage],
        on_event: types::EventSink<'_>,
    ) -> Result<AssistantTurn, String> {
        let (client, key, model, system) = (self.client, self.api_key, self.model, self.system);
        match self.provider {
            "anthropic" => {
                anthropic::stream_chat(client, key, model, system, messages, self.tools, on_event)
                    .await
            }
            "openai" => {
                openai::stream_chat(client, key, model, system, messages, self.tools, on_event)
                    .await
            }
            "google" => {
                gemini::stream_chat(client, key, model, system, messages, self.tools, on_event)
                    .await
            }
            other => Err(format!("Unknown provider: {other}")),
        }
    }
}

fn preview(content: &str) -> String {
    if content.len() <= TOOL_PREVIEW_CHARS {
        return content.to_string();
    }
    let mut cut = TOOL_PREVIEW_CHARS;
    while !content.is_char_boundary(cut) {
        cut -= 1;
    }
    format!("{}…", &content[..cut])
}

/// Runs one user turn. Streams `AiChatEvent`s over the channel while running
/// and returns the new messages (assistant turns + tool-result messages) for
/// the frontend to append to history and persist.
#[tauri::command]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    request: AiChatRequest,
    on_event: Channel<AiChatEvent>,
) -> Result<Vec<ChatMessage>, String> {
    let ai_settings = settings::load(&app)?;
    let api_key = ai_settings.api_key_for(&request.provider).to_string();
    if api_key.is_empty() {
        return Err(format!(
            "No API key configured for {}. Add one in the chat settings.",
            request.provider
        ));
    }

    let client = reqwest::Client::new();
    let supabase = SupabaseCtx {
        client: client.clone(),
        url: request.supabase_url.clone(),
        anon_key: request.supabase_anon_key.clone(),
        access_token: request.supabase_access_token.clone(),
    };
    let tool_defs = tools::tool_defs();
    let system = tools::system_prompt();
    let turn_ctx = TurnCtx {
        provider: &request.provider,
        client: &client,
        api_key: &api_key,
        model: &request.model,
        system: &system,
        tools: &tool_defs,
    };

    let mut conversation = request.messages.clone();
    let mut new_messages: Vec<ChatMessage> = Vec::new();

    for _round in 0..MAX_TOOL_ROUNDS {
        let mut emit = |event: AiChatEvent| {
            let _ = on_event.send(event);
        };
        let turn = turn_ctx.run(&conversation, &mut emit).await?;

        let assistant = ChatMessage {
            role: "assistant".into(),
            blocks: turn.blocks,
        };
        let tool_calls: Vec<(String, String, serde_json::Value)> = assistant
            .blocks
            .iter()
            .filter_map(|block| match block {
                ChatBlock::ToolUse { id, name, input } => {
                    Some((id.clone(), name.clone(), input.clone()))
                }
                _ => None,
            })
            .collect();

        conversation.push(assistant.clone());
        new_messages.push(assistant);
        let _ = on_event.send(AiChatEvent::TurnComplete);

        if tool_calls.is_empty() {
            break;
        }

        let mut result_blocks: Vec<ChatBlock> = Vec::new();
        for (id, name, input) in tool_calls {
            let (content, is_error) = match tools::execute_tool(&name, &input, &supabase).await {
                Ok(content) => (content, false),
                Err(error) => (error, true),
            };
            let _ = on_event.send(AiChatEvent::ToolResult {
                id: id.clone(),
                name: name.clone(),
                preview: preview(&content),
                is_error,
            });
            result_blocks.push(ChatBlock::ToolResult {
                tool_use_id: id,
                name,
                content,
                is_error,
            });
        }
        let results = ChatMessage {
            role: "user".into(),
            blocks: result_blocks,
        };
        conversation.push(results.clone());
        new_messages.push(results);
    }

    Ok(new_messages)
}
