alter table public.employees
  add column if not exists notifications_enabled boolean not null default true;

comment on column public.employees.notifications_enabled is
  'Whether the employee receives Telegram notifications for new channel messages.';
