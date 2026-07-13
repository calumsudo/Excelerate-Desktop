/**
 * Supabase persistence for AI chat conversations. RLS keeps every
 * conversation private to the user who created it.
 */
import { supabase } from "./supabase";
import type { Json } from "./supabase.types";
import type { ChatBlock, ChatMessage } from "./ai-chat-service";

export interface Conversation {
  id: string;
  title: string;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, title, provider, model, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to load conversations: ${error.message}`);
  return data ?? [];
}

export async function createConversation(
  title: string,
  provider: string,
  model: string
): Promise<Conversation> {
  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ title, provider, model })
    .select("id, title, provider, model, created_at, updated_at")
    .single();
  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data;
}

export async function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, "title" | "provider" | "model">>
): Promise<void> {
  const { error } = await supabase
    .from("chat_conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to update conversation: ${error.message}`);
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("chat_conversations").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []).map((row) => ({
    role: row.role,
    blocks: (row.content ?? []) as unknown as ChatBlock[],
  }));
}

export async function appendMessages(
  conversationId: string,
  messages: ChatMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  const rows = messages.map((message) => ({
    conversation_id: conversationId,
    role: message.role,
    content: message.blocks as unknown as Json,
  }));
  const { error } = await supabase.from("chat_messages").insert(rows);
  if (error) throw new Error(`Failed to save messages: ${error.message}`);
  await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}
