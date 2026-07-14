-- AI chat persistence: conversations and their messages, private to the
-- creating user (unlike portfolio tables, these are not shared via
-- portfolio_access). Message content stores the frontend's block array
-- (text / attachments / tool calls / tool results) as jsonb.

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  provider text not null default 'anthropic',
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

create index chat_conversations_user_idx
  on public.chat_conversations (user_id, updated_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users manage own conversations"
  on public.chat_conversations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own conversation messages"
  on public.chat_messages
  for all
  using (
    exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );
