//! Anthropic Messages API client (raw HTTP — Anthropic ships no official
//! Rust SDK). Streams `/v1/messages` SSE and reassembles the assistant turn.

use serde_json::{json, Value};

use super::sse::{ensure_success, read_sse};
use super::types::{AssistantTurn, ChatBlock, ChatMessage, EventSink, ToolDef};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 8192;

fn to_api_message(message: &ChatMessage) -> Value {
    let content: Vec<Value> = message
        .blocks
        .iter()
        .map(|block| match block {
            ChatBlock::Text { text } => json!({ "type": "text", "text": text }),
            ChatBlock::Image { media_type, data } => json!({
                "type": "image",
                "source": { "type": "base64", "media_type": media_type, "data": data }
            }),
            ChatBlock::Document {
                media_type, data, ..
            } => json!({
                "type": "document",
                "source": { "type": "base64", "media_type": media_type, "data": data }
            }),
            ChatBlock::ToolUse { id, name, input } => {
                json!({ "type": "tool_use", "id": id, "name": name, "input": input })
            }
            ChatBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
                ..
            } => json!({
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": content,
                "is_error": is_error
            }),
        })
        .collect();
    json!({ "role": message.role, "content": content })
}

/// In-progress content block while parsing the SSE stream.
enum BlockAcc {
    Text(String),
    ToolUse {
        id: String,
        name: String,
        json: String,
    },
}

pub async fn stream_chat(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    tools: &[ToolDef],
    on_event: EventSink<'_>,
) -> Result<AssistantTurn, String> {
    let body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "stream": true,
        "system": system,
        "messages": messages.iter().map(to_api_message).collect::<Vec<_>>(),
        "tools": tools.iter().map(|t| json!({
            "name": t.name,
            "description": t.description,
            "input_schema": t.input_schema,
        })).collect::<Vec<_>>(),
    });

    let response = client
        .post(API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;
    let response = ensure_success(response, "Anthropic").await?;

    let mut blocks: Vec<ChatBlock> = Vec::new();
    let mut current: Option<BlockAcc> = None;

    read_sse(response, |event| {
        let data: Value = serde_json::from_str(&event.data)
            .map_err(|e| format!("Anthropic sent invalid JSON: {e}"))?;
        match data["type"].as_str().unwrap_or_default() {
            "content_block_start" => {
                let block = &data["content_block"];
                current = match block["type"].as_str().unwrap_or_default() {
                    "tool_use" => Some(BlockAcc::ToolUse {
                        id: block["id"].as_str().unwrap_or_default().to_string(),
                        name: block["name"].as_str().unwrap_or_default().to_string(),
                        json: String::new(),
                    }),
                    // Treat anything else (text, thinking summaries) as text.
                    _ => Some(BlockAcc::Text(
                        block["text"].as_str().unwrap_or_default().to_string(),
                    )),
                };
            }
            "content_block_delta" => match data["delta"]["type"].as_str().unwrap_or_default() {
                "text_delta" => {
                    let text = data["delta"]["text"].as_str().unwrap_or_default();
                    if let Some(BlockAcc::Text(acc)) = current.as_mut() {
                        acc.push_str(text);
                    }
                    on_event(super::types::AiChatEvent::TextDelta {
                        text: text.to_string(),
                    });
                }
                "input_json_delta" => {
                    if let Some(BlockAcc::ToolUse { json, .. }) = current.as_mut() {
                        json.push_str(data["delta"]["partial_json"].as_str().unwrap_or_default());
                    }
                }
                _ => {}
            },
            "content_block_stop" => match current.take() {
                Some(BlockAcc::Text(text)) => {
                    if !text.is_empty() {
                        blocks.push(ChatBlock::Text { text });
                    }
                }
                Some(BlockAcc::ToolUse { id, name, json }) => {
                    let input: Value = serde_json::from_str(&json)
                        .unwrap_or_else(|_| Value::Object(Default::default()));
                    on_event(super::types::AiChatEvent::ToolCall {
                        id: id.clone(),
                        name: name.clone(),
                        input: input.clone(),
                    });
                    blocks.push(ChatBlock::ToolUse { id, name, input });
                }
                None => {}
            },
            "message_stop" => return Ok(false),
            "error" => {
                return Err(format!(
                    "Anthropic stream error: {}",
                    data["error"]["message"].as_str().unwrap_or(&event.data)
                ));
            }
            _ => {}
        }
        Ok(true)
    })
    .await?;

    Ok(AssistantTurn { blocks })
}
