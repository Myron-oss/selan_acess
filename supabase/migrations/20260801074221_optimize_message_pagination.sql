create index if not exists messages_channel_created_id_idx
  on public.messages(channel_id, created_at desc, id desc);

drop index if exists public.messages_channel_id_created_at_idx;

create index if not exists employees_role_id_idx
  on public.employees(role_id);

-- message_reactions(message_id, reactor_tg_id, emoji) and
-- message_reads(message_id, reader_tg_id) are already covered by their
-- unique indexes. message_reads also has (message_id, read_at), so separate
-- duplicate indexes on message_id would only slow writes.
