alter table public.messages
  add column if not exists file_url text,
  add column if not exists file_type text,
  add column if not exists file_name text,
  add column if not exists file_size bigint;

-- Вложение может отправляться без текстовой подписи.
alter table public.messages
  alter column text set default '';

alter table public.messages
  drop constraint if exists messages_text_check,
  drop constraint if exists messages_text_length_check,
  drop constraint if exists messages_content_check,
  drop constraint if exists messages_file_type_check,
  drop constraint if exists messages_file_metadata_check;

alter table public.messages
  add constraint messages_text_length_check
    check (char_length(text) <= 2000),
  add constraint messages_content_check
    check (char_length(btrim(text)) > 0 or file_url is not null),
  add constraint messages_file_type_check
    check (file_type is null or file_type in ('image', 'video', 'document')),
  add constraint messages_file_metadata_check
    check (
      (file_url is null and file_type is null and file_name is null and file_size is null)
      or
      (file_url is not null and file_type is not null and file_name is not null and file_size > 0)
    );

-- Bucket chat-attachments создаётся вручную как public bucket в Supabase Dashboard.
-- Загрузка разрешается только короткоживущим signed upload URL, который сервер
-- выдаёт после проверки Telegram-сессии и доступа к ветке.
