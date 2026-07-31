alter table public.employees
  add column avatar_url text,
  add column theme_preference text not null default 'system',
  add column accent_color text not null default 'blue';

alter table public.employees
  add constraint employees_theme_preference_check
    check (theme_preference in ('light', 'dark', 'system')),
  add constraint employees_accent_color_check
    check (
      accent_color in (
        'blue',
        'green',
        'violet',
        'orange',
        'rose',
        'cyan',
        'indigo'
      )
    );

-- Публичный bucket подходит для аватаров: чтение идёт по публичному URL,
-- а загрузка/перезапись выполняется только сервером через service_role.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/*']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
