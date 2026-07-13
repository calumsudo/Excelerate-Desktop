//! OpenAI Chat Completions client (raw HTTP). Streams tool-call and text
//! deltas and reassembles them into the shared `AssistantTurn` shape.

use std::collections::BTreeMap;

use serde_json::{json, Value};

use super::sse::{ensure_success, read_sse};
use super::types::{AssistantTurn, ChatBlock, ChatMessage, EventSink, ToolDef};

const API_URL: &str = "https://api.openai.com/v1/chat/completions";

/// One chat message can expand to several OpenAI messages: tool results must
/// be their own `role: "tool"` messages.
fn to_api_messages(message: &ChatMessage, out: &mut Vec<Value>) {
    if message.role == "assistant" {
        let mut text = String::new();
        let mut tool_calls: Vec<Value> = Vec::new();
        for block in &message.blocks {
            match block {
                ChatBlock::Text { text: t } => text.push_str(t),
                ChatBlock::ToolUse { id, name, input } => tool_calls.push(json!({
                    "id": id,
                    "type": "function",
                    "function": { "name": name, "arguments": input.to_string() }
                })),
                _ => {}
            }
        }
        let mut msg = json!({ "role": "assistant" });
        msg["content"] = if text.is_empty() {
            Value::Null
        } else {
            Value::String(text)
        };
        if !tool_calls.is_empty() {
            msg["tool_calls"] = Value::Array(tool_calls);
        }
        out.push(msg);
        return;
    }

    let mut parts: Vec<Value> = Vec::new();
    for block in &message.blocks {
        match block {
            ChatBlock::Text { text } => parts.push(json!({ "type": "text", "text": text })),
            ChatBlock::Image { media_type, data } => parts.push(json!({
                "type": "image_url",
                "image_url": { "url": format!("data:{media_type};base64,{data}") }
            })),
            ChatBlock::Document {
                media_type,
                data,
                name,
            } => parts.push(json!({
                "type": "file",
                "file": {
                    "filename": name,
                    "file_data": format!("data:{media_type};base64,{data}")
                }
            })),
            ChatBlock::ToolResult {
                tool_use_id,
                content,
                ..
            } => out.push(json!({
                "role": "tool",
                "tool_call_id": tool_use_id,
                "content": content
            })),
            ChatBlock::ToolUse { .. } => {}
        }
    }
    if !parts.is_empty() {
        out.push(json!({ "role": "user", "content": parts }));
    }
}

#[derive(Default)]
struct ToolCallAcc {
    id: String,
    name: String,
    arguments: String,
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
    let mut api_messages = vec![json!({ "role": "system", "content": system })];
    for message in messages {
        to_api_messages(message, &mut api_messages);
    }

    let body = json!({
        "model": model,
        "stream": true,
        "messages": api_messages,
        "tools": tools.iter().map(|t| json!({
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.input_schema,
            }
        })).collect::<Vec<_>>(),
    });

    let response = client
        .post(API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {e}"))?;
    let response = ensure_success(response, "OpenAI").await?;

    let mut text = String::new();
    let mut tool_accs: BTreeMap<u64, ToolCallAcc> = BTreeMap::new();

    read_sse(response, |event| {
        if event.data.trim() == "[DONE]" {
            return Ok(false);
        }
        let data: Value = serde_json::from_str(&event.data)
            .map_err(|e| format!("OpenAI sent invalid JSON: {e}"))?;
        if let Some(error) = data.get("error") {
            return Err(format!("OpenAI stream error: {error}"));
        }
        let delta = &data["choices"][0]["delta"];
        if let Some(t) = delta["content"].as_str() {
            if !t.is_empty() {
                text.push_str(t);
                on_event(super::types::AiChatEvent::TextDelta {
                    text: t.to_string(),
                });
            }
        }
        if let Some(calls) = delta["tool_calls"].as_array() {
            for call in calls {
                let index = call["index"].as_u64().unwrap_or(0);
                let acc = tool_accs.entry(index).or_default();
                if let Some(id) = call["id"].as_str() {
                    acc.id.push_str(id);
                }
                if let Some(name) = call["function"]["name"].as_str() {
                    acc.name.push_str(name);
                }
                if let Some(args) = call["function"]["arguments"].as_str() {
                    acc.arguments.push_str(args);
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
    for (index, acc) in tool_accs {
        let id = if acc.id.is_empty() {
            format!("call_{index}")
        } else {
            acc.id
        };
        let input: Value = serde_json::from_str(&acc.arguments)
            .unwrap_or_else(|_| Value::Object(Default::default()));
        on_event(super::types::AiChatEvent::ToolCall {
            id: id.clone(),
            name: acc.name.clone(),
            input: input.clone(),
        });
        blocks.push(ChatBlock::ToolUse {
            id,
            name: acc.name,
            input,
        });
    }

    Ok(AssistantTurn { blocks })
}
