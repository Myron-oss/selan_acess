create table public.bot_registration_sessions (
  tg_id bigint primary key,
  chat_id bigint not null,
  tg_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bot_registration_sessions enable row level security;

-- Черновик анкеты доступен только webhook через service_role.
create policy "deny direct bot registration session access"
  on public.bot_registration_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.bot_registration_sessions from anon, authenticated;
