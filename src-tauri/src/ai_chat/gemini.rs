//! Google Gemini (Generative Language API) client. Streams
//! `models/{model}:streamGenerateContent?alt=sse` and reassembles the turn.

use serde_json::{json, Value};

use super::sse::{ensure_success, read_sse};
use super::types::{AssistantTurn, ChatBlock, ChatMessage, EventSink, ToolDef};

const API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

fn to_api_content(message: &ChatMessage) -> Value {
    let role = if message.role == "assistant" {
        "model"
    } else {
        "user"
    };
    let parts: Vec<Value> = message
        .blocks
        .iter()
        .map(|block| match block {
            ChatBlock::Text { text } => json!({ "text": text }),
            ChatBlock::Image { media_type, data }
            | ChatBlock::Document {
                media_type, data, ..
            } => json!({ "inlineData": { "mimeType": media_type, "data": data } }),
            ChatBlock::ToolUse { name, input, .. } => {
                json!({ "functionCall": { "name": name, "args": input } })
            }
            ChatBlock::ToolResult {
                name,
                content,
                is_error,
                ..
            } => {
                let response = if *is_error {
                    json!({ "error": content })
                } else {
                    json!({ "result": content })
                };
                json!({ "functionResponse": { "name": name, "response": response } })
            }
        })
        .collect();
    json!({ "role": role, "parts": parts })
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
        "systemInstruction": { "parts": [{ "text": system }] },
        "contents": messages.iter().map(to_api_content).collect::<Vec<_>>(),
        "tools": [{
            "functionDeclarations": tools.iter().map(|t| json!({
                "name": t.name,
                "description": t.description,
                "parameters": t.input_schema,
            })).collect::<Vec<_>>()
        }],
    });

    let url = format!("{API_BASE}/{model}:streamGenerateContent?alt=sse");
    let response = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {e}"))?;
    let response = ensure_success(response, "Gemini").await?;

    let mut text = String::new();
    let mut tool_calls: Vec<(String, Value)> = Vec::new();

    read_sse(response, |event| {
        let data: Value = serde_json::from_str(&event.data)
            .map_err(|e| format!("Gemini sent invalid JSON: {e}"))?;
        if let Some(error) = data.get("error") {
            return Err(format!("Gemini stream error: {error}"));
        }
        if let Some(parts) = data["candidates"][0]["content"]["parts"].as_array() {
            for part in parts {
                if let Some(t) = part["text"].as_str() {
                    text.push_str(t);
                    on_event(super::types::AiChatEvent::TextDelta {
                        text: t.to_string(),
                    });
                }
                if part["functionCall"].is_object() {
                    let name = part["functionCall"]["name"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string();
                    let args = part["functionCall"]["args"].clone();
                    tool_calls.push((name, args));
                }
            }
        }
        Ok(true)
    })
    .await?;

    let mut blocks: Vec<ChatBlock> = Vec::new();
    if !text.is_empty() {
        blocks.push(ChatBlock::Text { text });
    }
    for (index, (name, args)) in tool_calls.into_iter().enumerate() {
        // Gemini function calls carry no id — synthesize one for the loop.
        let id = format!("call_{index}");
        let input = if args.is_object() {
            args
        } else {
            Value::Object(Default::default())
        };
        on_event(super::types::AiChatEvent::ToolCall {
            id: id.clone(),
            name: name.clone(),
            input: input.clone(),
        });
        blocks.push(ChatBlock::ToolUse { id, name, input });
    }

    Ok(AssistantTurn { blocks })
}
