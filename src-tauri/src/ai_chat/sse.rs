//! Minimal Server-Sent-Events reader over a `reqwest` byte stream. All three
//! provider APIs stream SSE; only the `event:` and `data:` fields matter.

use futures_util::StreamExt;

pub struct SseEvent {
    #[allow(dead_code)]
    pub event: Option<String>,
    pub data: String,
}

/// Reads the response body as SSE, invoking `on_event` for each complete
/// event. The callback returns `Ok(false)` to stop reading early.
pub async fn read_sse(
    response: reqwest::Response,
    mut on_event: impl FnMut(SseEvent) -> Result<bool, String>,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut event_name: Option<String> = None;
    let mut data_lines: Vec<String> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream read error: {e}"))?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim_end_matches(['\n', '\r']);

            if line.is_empty() {
                if !data_lines.is_empty() {
                    let keep_going = on_event(SseEvent {
                        event: event_name.take(),
                        data: data_lines.join("\n"),
                    })?;
                    data_lines.clear();
                    if !keep_going {
                        return Ok(());
                    }
                } else {
                    event_name = None;
                }
            } else if let Some(rest) = line.strip_prefix("event:") {
                event_name = Some(rest.trim().to_string());
            } else if let Some(rest) = line.strip_prefix("data:") {
                data_lines.push(rest.strip_prefix(' ').unwrap_or(rest).to_string());
            }
        }
    }

    if !data_lines.is_empty() {
        on_event(SseEvent {
            event: event_name.take(),
            data: data_lines.join("\n"),
        })?;
    }
    Ok(())
}

/// Shared pre-flight: bail with the response body when the request failed
/// (provider errors arrive as JSON bodies with non-2xx status).
pub async fn ensure_success(
    response: reqwest::Response,
    provider: &str,
) -> Result<reqwest::Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    Err(format!("{provider} API error ({status}): {body}"))
}
