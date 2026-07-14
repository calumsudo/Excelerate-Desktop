/**
 * Frontend wrapper for the Rust AI chat commands (`ai_chat_stream`,
 * `get_ai_settings`, `save_ai_settings`, `prepare_chat_attachment`).
 * Types here mirror `src-tauri/src/ai_chat/types.rs`.
 */
import { Channel, invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";

export type AiProvider = "anthropic" | "openai" | "google" | "lmstudio";

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  google: "Google (Gemini)",
  lmstudio: "LM Studio (local)",
};

/** Local servers don't authenticate; every cloud provider needs a key. */
export function providerNeedsApiKey(provider: AiProvider): boolean {
  return provider !== "lmstudio";
}

export type ChatBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; media_type: string; data: string }
  | { kind: "document"; media_type: string; data: string; name: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | {
      kind: "tool_result";
      tool_use_id: string;
      name: string;
      content: string;
      is_error: boolean;
    };

export interface ChatMessage {
  role: "user" | "assistant";
  blocks: ChatBlock[];
}

export interface AiSettings {
  default_provider: AiProvider;
  anthropic_api_key: string;
  openai_api_key: string;
  google_api_key: string;
  anthropic_model: string;
  openai_model: string;
  google_model: string;
  lmstudio_base_url: string;
  lmstudio_model: string;
  lmstudio_api_key: string;
}

/** Live events streamed from Rust while a turn runs. */
export type AiChatEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; preview: string; is_error: boolean }
  | { type: "turn_complete" };

export interface PreparedAttachment {
  name: string;
  blocks: ChatBlock[];
}

export function getAiSettings(): Promise<AiSettings> {
  return invoke<AiSettings>("get_ai_settings");
}

export function saveAiSettings(settings: AiSettings): Promise<void> {
  return invoke("save_ai_settings", { settings });
}

export function prepareChatAttachment(path: string): Promise<PreparedAttachment> {
  return invoke<PreparedAttachment>("prepare_chat_attachment", { path });
}

export function apiKeyFor(settings: AiSettings, provider: AiProvider): string {
  if (provider === "anthropic") return settings.anthropic_api_key;
  if (provider === "openai") return settings.openai_api_key;
  if (provider === "google") return settings.google_api_key;
  return settings.lmstudio_api_key;
}

export function modelFor(settings: AiSettings, provider: AiProvider): string {
  if (provider === "anthropic") return settings.anthropic_model;
  if (provider === "openai") return settings.openai_model;
  if (provider === "google") return settings.google_model;
  return settings.lmstudio_model;
}

/**
 * Runs one user turn through the Rust agent loop. `onEvent` receives live
 * streaming events; the resolved value is the canonical list of new messages
 * (assistant turns + tool-result messages) to append to the conversation.
 */
export async function streamChat(params: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  onEvent: (event: AiChatEvent) => void;
}): Promise<ChatMessage[]> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Not signed in — the AI assistant needs an active session to query data.");
  }

  const channel = new Channel<AiChatEvent>();
  channel.onmessage = params.onEvent;

  return invoke<ChatMessage[]>("ai_chat_stream", {
    request: {
      provider: params.provider,
      model: params.model,
      messages: params.messages,
      supabase_url: import.meta.env.VITE_SUPABASE_URL,
      supabase_anon_key: import.meta.env.VITE_SUPABASE_ANON_KEY,
      supabase_access_token: accessToken,
    },
    onEvent: channel,
  });
}
