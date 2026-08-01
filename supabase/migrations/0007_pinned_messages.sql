alter table public.messages
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by_tg_id bigint;

alter table public.messages
  drop constraint if exists messages_pin_metadata_check;

alter table public.messages
  add constraint messages_pin_metadata_check
  check (
    (is_pinned and pinned_at is not null and pinned_by_tg_id is not null)
    or
    (not is_pinned and pinned_at is null and pinned_by_tg_id is null)
  );

create index if not exists messages_channel_pinned_at_idx
  on public.messages(channel_id, pinned_at desc)
  where is_pinned;
