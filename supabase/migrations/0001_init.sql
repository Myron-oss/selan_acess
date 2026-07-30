create extension if not exists pgcrypto;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_admin boolean not null default false
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tg_id bigint unique not null,
  full_name text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  allowed_role_ids uuid[] not null default '{}'
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  sender_tg_id bigint not null,
  sender_name text not null,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_channel_id_created_at_idx
  on public.messages(channel_id, created_at);

alter table public.roles enable row level security;
alter table public.employees enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;

-- Справочники ролей и сотрудников доступны только серверному service_role.
-- Эти запретительные политики явно фиксируют отсутствие прямого доступа.
create policy "deny direct role access"
  on public.roles
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny direct employee access"
  on public.employees
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.roles from anon, authenticated;
revoke all on table public.employees from anon, authenticated;

-- Realtime использует ту же роль anon, что и REST, поэтому PostgreSQL RLS не
-- умеет отличить realtime SELECT от прямого SELECT. Эти две read-only политики
-- нужны, чтобы Supabase Realtime мог доставлять INSERT клиентам. Запись для anon
-- запрещена. Начальная выдача каналов и истории всегда проходит через серверные
-- API с проверкой роли; клиент подписывается только на уже выданный channel_id.
-- Для ещё более строгой изоляции в крупной инсталляции следует выдавать
-- короткоживущий Supabase JWT с разрешёнными channel_id.
create policy "anon may read channels for realtime"
  on public.channels
  for select
  to anon
  using (true);

create policy "anon may read messages for realtime"
  on public.messages
  for select
  to anon
  using (true);

revoke all on table public.channels from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
grant select on table public.channels to anon;
grant select on table public.messages to anon;

-- Включаем события INSERT таблицы messages в Supabase Realtime.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end
$$;

-- Базовые роли и ветки. Первый администратор добавляется вручную после
-- миграции (см. README), потому что Telegram ID нельзя безопасно зашивать в SQL.
insert into public.roles (name, is_admin)
values
  ('Администратор', true),
  ('Руководитель', false),
  ('Сотрудник', false);

insert into public.channels (name, emoji, allowed_role_ids)
select
  'Общий',
  '💬',
  array_agg(id order by name)
from public.roles;

insert into public.channels (name, emoji, allowed_role_ids)
select
  'Руководители',
  '📌',
  array_agg(id order by name)
from public.roles
where name in ('Администратор', 'Руководитель');

insert into public.channels (name, emoji, allowed_role_ids)
select
  'Администраторы',
  '🛡️',
  array_agg(id order by name)
from public.roles
where name = 'Администратор';
