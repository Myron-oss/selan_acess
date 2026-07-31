create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  tg_id bigint unique not null,
  tg_username text,
  full_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index access_requests_pending_created_at_idx
  on public.access_requests(created_at)
  where status = 'pending';

alter table public.access_requests enable row level security;

-- Заявки читаются и изменяются только серверными API с service_role.
create policy "deny direct access request access"
  on public.access_requests
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.access_requests from anon, authenticated;

-- Одобрение выполняется атомарно: сотрудник создаётся и статус заявки
-- меняется в одной транзакции. Вызывать функцию может только service_role.
create or replace function public.approve_access_request(
  p_request_id uuid,
  p_role_id uuid
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
begin
  select *
    into request_row
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

  return query
    insert into public.employees (tg_id, full_name, role_id)
    values (request_row.tg_id, request_row.full_name, p_role_id)
    returning
      employees.id,
      employees.tg_id,
      employees.full_name,
      employees.role_id,
      employees.created_at;

  update public.access_requests
    set status = 'approved'
    where access_requests.id = p_request_id;
end;
$$;

revoke all on function public.approve_access_request(uuid, uuid) from public;
revoke all on function public.approve_access_request(uuid, uuid)
  from anon, authenticated;
grant execute on function public.approve_access_request(uuid, uuid)
  to service_role;
