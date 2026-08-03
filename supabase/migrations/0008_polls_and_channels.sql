-- Индивидуальный доступ сотрудников к веткам.
create table public.employee_channel_access (
  id uuid primary key default gen_random_uuid(),
  employee_tg_id bigint not null
    references public.employees(tg_id) on delete cascade,
  channel_id uuid not null
    references public.channels(id) on delete cascade,
  granted_at timestamptz not null default now(),
  unique (employee_tg_id, channel_id)
);

create index employee_channel_access_channel_employee_idx
  on public.employee_channel_access(channel_id, employee_tg_id);

-- Сохраняем текущие права при переходе с allowed_role_ids.
insert into public.employee_channel_access (employee_tg_id, channel_id)
select employees.tg_id, channels.id
from public.employees
join public.channels
  on employees.role_id = any(channels.allowed_role_ids)
on conflict (employee_tg_id, channel_id) do nothing;

-- Опросы.
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null
    references public.channels(id) on delete cascade,
  creator_tg_id bigint not null,
  question text not null
    check (char_length(btrim(question)) between 1 and 300),
  is_anonymous boolean not null default false,
  allows_multiple_answers boolean not null default false,
  created_at timestamptz not null default now()
);

create index polls_channel_created_at_idx
  on public.polls(channel_id, created_at);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null
    references public.polls(id) on delete cascade,
  option_text text not null
    check (char_length(btrim(option_text)) between 1 and 100),
  position integer not null check (position >= 0),
  unique (poll_id, position)
);

create index poll_options_poll_id_idx
  on public.poll_options(poll_id);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_option_id uuid not null
    references public.poll_options(id) on delete cascade,
  voter_tg_id bigint not null,
  created_at timestamptz not null default now(),
  unique (poll_option_id, voter_tg_id)
);

create index poll_votes_voter_option_idx
  on public.poll_votes(voter_tg_id, poll_option_id);

alter table public.messages
  add column poll_id uuid unique
    references public.polls(id) on delete set null,
  add column updated_at timestamptz not null default now();

alter table public.messages
  drop constraint if exists messages_content_check;

alter table public.messages
  add constraint messages_content_check
    check (
      char_length(btrim(text)) > 0
      or file_url is not null
      or poll_id is not null
    );

-- Новые таблицы доступны только серверным API через service_role.
alter table public.employee_channel_access enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy "deny direct employee channel access"
  on public.employee_channel_access
  for all to anon, authenticated
  using (false) with check (false);

create policy "deny direct poll access"
  on public.polls
  for all to anon, authenticated
  using (false) with check (false);

create policy "deny direct poll option access"
  on public.poll_options
  for all to anon, authenticated
  using (false) with check (false);

create policy "deny direct poll vote access"
  on public.poll_votes
  for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.employee_channel_access from anon, authenticated;
revoke all on table public.polls from anon, authenticated;
revoke all on table public.poll_options from anon, authenticated;
revoke all on table public.poll_votes from anon, authenticated;

-- Полная замена доступов сотрудника выполняется атомарно.
create or replace function public.replace_employee_channel_access(
  p_employee_tg_id bigint,
  p_channel_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized_channel_ids uuid[];
begin
  if not exists (
    select 1 from public.employees
    where employees.tg_id = p_employee_tg_id
  ) then
    raise exception 'employee_not_found';
  end if;

  select coalesce(array_agg(distinct channel_id), '{}'::uuid[])
    into normalized_channel_ids
  from unnest(coalesce(p_channel_ids, '{}'::uuid[])) as requested(channel_id);

  if exists (
    select 1
    from unnest(normalized_channel_ids) as requested(channel_id)
    left join public.channels on channels.id = requested.channel_id
    where channels.id is null
  ) then
    raise exception 'channel_not_found';
  end if;

  delete from public.employee_channel_access
  where employee_channel_access.employee_tg_id = p_employee_tg_id;

  insert into public.employee_channel_access (employee_tg_id, channel_id)
  select p_employee_tg_id, channel_id
  from unnest(normalized_channel_ids) as requested(channel_id);
end;
$$;

revoke all on function public.replace_employee_channel_access(bigint, uuid[])
  from public, anon, authenticated;
grant execute on function public.replace_employee_channel_access(bigint, uuid[])
  to service_role;

-- Одобрение заявки и первоначальные доступы создаются одной транзакцией.
drop function if exists public.approve_access_request(uuid, uuid);

create function public.approve_access_request(
  p_request_id uuid,
  p_role_id uuid,
  p_channel_ids uuid[]
)
returns table (
  id uuid,
  tg_id bigint,
  full_name text,
  role_id uuid,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  request_row public.access_requests%rowtype;
  created_employee public.employees%rowtype;
  normalized_channel_ids uuid[];
begin
  select * into request_row
  from public.access_requests
  where access_requests.id = p_request_id
  for update;

  if not found then
    raise exception 'access_request_not_found';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'access_request_already_processed';
  end if;
  if not exists (select 1 from public.roles where roles.id = p_role_id) then
    raise exception 'role_not_found';
  end if;

  select coalesce(array_agg(distinct channel_id), '{}'::uuid[])
    into normalized_channel_ids
  from unnest(coalesce(p_channel_ids, '{}'::uuid[])) as requested(channel_id);

  if exists (
    select 1
    from unnest(normalized_channel_ids) as requested(channel_id)
    left join public.channels on channels.id = requested.channel_id
    where channels.id is null
  ) then
    raise exception 'channel_not_found';
  end if;

  insert into public.employees (tg_id, full_name, role_id)
  values (request_row.tg_id, request_row.full_name, p_role_id)
  returning * into created_employee;

  insert into public.employee_channel_access (employee_tg_id, channel_id)
  select created_employee.tg_id, channel_id
  from unnest(normalized_channel_ids) as requested(channel_id);

  update public.access_requests
  set status = 'approved'
  where access_requests.id = p_request_id;

  return query select
    created_employee.id,
    created_employee.tg_id,
    created_employee.full_name,
    created_employee.role_id,
    created_employee.created_at;
end;
$$;

revoke all on function public.approve_access_request(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.approve_access_request(uuid, uuid, uuid[])
  to service_role;

-- Опрос и связанное сообщение создаются атомарно.
create function public.create_poll_message(
  p_channel_id uuid,
  p_creator_tg_id bigint,
  p_sender_name text,
  p_question text,
  p_is_anonymous boolean,
  p_allows_multiple_answers boolean,
  p_options text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_poll_id uuid;
  normalized_question text := btrim(p_question);
  normalized_options text[];
begin
  if not exists (
    select 1 from public.employee_channel_access
    where employee_channel_access.employee_tg_id = p_creator_tg_id
      and employee_channel_access.channel_id = p_channel_id
  ) then
    raise exception 'channel_access_denied';
  end if;

  if char_length(normalized_question) not between 1 and 300 then
    raise exception 'invalid_poll_question';
  end if;

  select array_agg(btrim(option_text) order by position)
    into normalized_options
  from unnest(coalesce(p_options, '{}'::text[]))
    with ordinality as options(option_text, position)
  where char_length(btrim(option_text)) between 1 and 100;

  if coalesce(cardinality(normalized_options), 0) < 2
    or cardinality(normalized_options) > 10
    or cardinality(normalized_options) <> cardinality(p_options)
    or (
      select count(distinct lower(option_text))
      from unnest(normalized_options) as option_values(option_text)
    ) <> cardinality(normalized_options)
  then
    raise exception 'invalid_poll_options';
  end if;

  insert into public.polls (
    channel_id,
    creator_tg_id,
    question,
    is_anonymous,
    allows_multiple_answers
  ) values (
    p_channel_id,
    p_creator_tg_id,
    normalized_question,
    coalesce(p_is_anonymous, false),
    coalesce(p_allows_multiple_answers, false)
  ) returning polls.id into created_poll_id;

  insert into public.poll_options (poll_id, option_text, position)
  select created_poll_id, option_text, position::integer - 1
  from unnest(normalized_options)
    with ordinality as options(option_text, position);

  insert into public.messages (
    channel_id,
    sender_tg_id,
    sender_name,
    text,
    poll_id
  ) values (
    p_channel_id,
    p_creator_tg_id,
    p_sender_name,
    normalized_question,
    created_poll_id
  );

  return created_poll_id;
end;
$$;

revoke all on function public.create_poll_message(
  uuid, bigint, text, text, boolean, boolean, text[]
) from public, anon, authenticated;
grant execute on function public.create_poll_message(
  uuid, bigint, text, text, boolean, boolean, text[]
) to service_role;

-- Голосование: повторный выбор снимает голос, одиночный выбор переключается.
create function public.vote_in_poll(
  p_poll_id uuid,
  p_option_id uuid,
  p_voter_tg_id bigint
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  poll_row public.polls%rowtype;
  selected_option_exists boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_poll_id::text || ':' || p_voter_tg_id::text, 0)
  );

  select polls.* into poll_row
  from public.polls
  join public.poll_options on poll_options.poll_id = polls.id
  where polls.id = p_poll_id
    and poll_options.id = p_option_id;

  if not found then
    raise exception 'poll_or_option_not_found';
  end if;
  if not exists (
    select 1 from public.employee_channel_access
    where employee_channel_access.employee_tg_id = p_voter_tg_id
      and employee_channel_access.channel_id = poll_row.channel_id
  ) then
    raise exception 'channel_access_denied';
  end if;

  select exists (
    select 1 from public.poll_votes
    where poll_votes.poll_option_id = p_option_id
      and poll_votes.voter_tg_id = p_voter_tg_id
  ) into selected_option_exists;

  if poll_row.allows_multiple_answers then
    if selected_option_exists then
      delete from public.poll_votes
      where poll_votes.poll_option_id = p_option_id
        and poll_votes.voter_tg_id = p_voter_tg_id;
      return false;
    end if;

    insert into public.poll_votes (poll_option_id, voter_tg_id)
    values (p_option_id, p_voter_tg_id);
    return true;
  end if;

  delete from public.poll_votes
  using public.poll_options
  where poll_votes.poll_option_id = poll_options.id
    and poll_options.poll_id = p_poll_id
    and poll_votes.voter_tg_id = p_voter_tg_id;

  if selected_option_exists then
    return false;
  end if;

  insert into public.poll_votes (poll_option_id, voter_tg_id)
  values (p_option_id, p_voter_tg_id);
  return true;
end;
$$;

revoke all on function public.vote_in_poll(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.vote_in_poll(uuid, uuid, bigint)
  to service_role;

-- Любое изменение голосов обновляет сообщение. Клиенты уже подписаны на
-- messages через Realtime и после UPDATE безопасно перечитывают результаты API.
create function public.touch_poll_message_after_vote()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_poll_id uuid;
  target_option_id uuid;
begin
  target_option_id := case
    when tg_op = 'DELETE' then old.poll_option_id
    else new.poll_option_id
  end;

  select poll_options.poll_id into target_poll_id
  from public.poll_options
  where poll_options.id = target_option_id;

  update public.messages
  set updated_at = now()
  where messages.poll_id = target_poll_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger poll_votes_touch_message
after insert or delete on public.poll_votes
for each row execute function public.touch_poll_message_after_vote();

-- Один батч-запрос для боковой панели каналов.
create function public.get_employee_channels(p_employee_tg_id bigint)
returns table (
  id uuid,
  name text,
  emoji text,
  participant_count bigint,
  last_message_preview text,
  last_message_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    channels.id,
    channels.name,
    channels.emoji,
    (
      select count(*)
      from public.employee_channel_access as participants
      where participants.channel_id = channels.id
    ) as participant_count,
    latest.preview as last_message_preview,
    latest.created_at as last_message_at
  from public.employee_channel_access as own_access
  join public.channels on channels.id = own_access.channel_id
  left join lateral (
    select
      case
        when messages.poll_id is not null then '📊 ' || messages.text
        when messages.file_type = 'image' then '🖼️ Фото'
        when messages.file_type = 'video' then '🎬 Видео'
        when messages.file_type = 'document' then '📄 ' || coalesce(messages.file_name, 'Документ')
        else left(messages.text, 100)
      end as preview,
      messages.created_at
    from public.messages
    where messages.channel_id = channels.id
    order by messages.created_at desc
    limit 1
  ) as latest on true
  where own_access.employee_tg_id = p_employee_tg_id
  order by coalesce(latest.created_at, '-infinity'::timestamptz) desc,
    channels.name asc;
$$;

revoke all on function public.get_employee_channels(bigint)
  from public, anon, authenticated;
grant execute on function public.get_employee_channels(bigint)
  to service_role;
