alter table public.messages
  add column reply_to_message_id uuid
    references public.messages(id) on delete set null;

create index messages_reply_to_message_id_idx
  on public.messages(reply_to_message_id)
  where reply_to_message_id is not null;

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reactor_tg_id bigint not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint message_reactions_emoji_not_blank_check
    check (char_length(btrim(emoji)) between 1 and 16),
  constraint message_reactions_message_reactor_emoji_key
    unique(message_id, reactor_tg_id, emoji)
);

create table public.message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reader_tg_id bigint not null,
  reader_name text not null,
  read_at timestamptz not null default now(),
  constraint message_reads_reader_name_not_blank_check
    check (char_length(btrim(reader_name)) between 1 and 150),
  constraint message_reads_message_reader_key
    unique(message_id, reader_tg_id)
);

-- Уникальные индексы выше уже покрывают быстрый поиск по message_id и
-- каскадное удаление. Отдельный индекс нужен для упорядоченного списка чтений.
create index message_reads_message_id_read_at_idx
  on public.message_reads(message_id, read_at);

alter table public.message_reactions enable row level security;
alter table public.message_reads enable row level security;

-- И чтение, и запись выполняются только серверными API через service_role.
-- Realtime-обновления отправляются API через Broadcast, поэтому таблицы не
-- публикуются в Postgres Changes и не требуют прямого доступа из браузера.
create policy "deny direct access to message reactions"
  on public.message_reactions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny direct access to message reads"
  on public.message_reads
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.message_reactions from anon, authenticated;
revoke all on table public.message_reads from anon, authenticated;
grant select, insert, update, delete on table public.message_reactions
  to service_role;
grant select, insert, update, delete on table public.message_reads
  to service_role;
