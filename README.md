# Форум Селан

Telegram Mini App для корпоративного общения: сотрудники видят только ветки,
разрешённые их роли, а администраторы управляют доступом внутри приложения.

## Возможности

- проверка подлинности Telegram `initData` по HMAC-SHA256 и сроку 24 часа;
- подписанная httpOnly-сессия без доверия к Telegram ID от клиента;
- серверная проверка роли при чтении каналов, истории и отправке сообщений;
- Supabase Realtime для новых сообщений;
- CRUD сотрудников в админ-панели;
- RLS на всех таблицах; `service_role` используется только на сервере;
- адаптивный интерфейс для Telegram WebView и Vercel.

## Требования

- Node.js 22 или новее;
- проект Supabase;
- Telegram-бот;
- аккаунт Vercel для публикации.

## 1. Установка

```bash
npm install
cp .env.example .env.local
```

Заполните `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
SESSION_SECRET=LONG_RANDOM_SECRET
```

Для `SESSION_SECRET` используйте случайную строку не короче 32 байт, например:

```bash
openssl rand -hex 32
```

`SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` и `SESSION_SECRET` нельзя
публиковать или добавлять в переменные с префиксом `NEXT_PUBLIC_`.
Файл `.env.local` уже добавлен в `.gitignore`.

## 2. Настройка Supabase

Создайте проект на [supabase.com](https://supabase.com), затем примените
`supabase/migrations/0001_init.sql` одним из способов:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Либо вставьте весь SQL-файл в **SQL Editor** панели Supabase и нажмите **Run**.
Миграция создаёт таблицы, индекс, RLS-политики, базовые роли и три ветки.

### Добавление первого администратора

До входа в Mini App добавьте первого администратора через SQL Editor. Узнать
свой Telegram ID можно у служебного бота вроде `@userinfobot`.

```sql
insert into public.employees (tg_id, full_name, role_id)
select 123456789, 'Имя Администратора', id
from public.roles
where name = 'Администратор';
```

Замените `123456789` и имя на реальные значения. После этого остальных
сотрудников можно добавлять через вкладку **⚙️ Админка**.

### Realtime и RLS

Миграция добавляет `messages` в публикацию `supabase_realtime`. Supabase
Realtime и REST используют одну роль `anon`, поэтому RLS не может отличить
подписку от прямого чтения. Политики дают `anon` только `SELECT` для
`channels/messages`; все записи идут через сервер. Сервер всё равно проверяет
роль до первоначальной выдачи канала и истории, а клиент подписывается по уже
разрешённому `channel_id`. Для систем с повышенными требованиями можно перейти
на короткоживущие Supabase JWT с разрешёнными каналами.

## 3. Локальный запуск

```bash
npm run dev
```

Telegram принимает только HTTPS URL. Для проверки Mini App на локальной машине
используйте HTTPS-туннель и укажите его адрес в BotFather. Обычное открытие
`localhost` покажет сообщение о необходимости запуска через Telegram, потому
что безопасного тестового обхода `initData` в проекте нет.

## 4. Развёртывание на Vercel

1. Загрузите репозиторий в GitHub/GitLab/Bitbucket.
2. В Vercel нажмите **Add New → Project** и импортируйте репозиторий.
3. Оставьте **Root Directory** пустым (корень репозитория): `package.json` и
   каталог `app/` уже находятся на верхнем уровне.
4. Добавьте все пять переменных из `.env.example` в **Settings → Environment
   Variables** для Production (и Preview при необходимости).
5. Нажмите **Deploy** и скопируйте итоговый HTTPS URL.

Сборка выполняется стандартной командой:

```bash
npm run build
```

## Настройка бота в BotFather

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram.
2. Отправьте `/newbot`, задайте отображаемое имя и уникальный username,
   заканчивающийся на `bot`.
3. Сохраните выданный токен и внесите его в `TELEGRAM_BOT_TOKEN` в Vercel.
   Никому не отправляйте токен.
4. После успешного деплоя отправьте BotFather команду `/setmenubutton`.
5. Выберите созданного бота.
6. Введите подпись кнопки, например `Открыть форум`.
7. Введите полный HTTPS URL деплоя Vercel, например
   `https://selan-forum.vercel.app`.
8. Откройте чат с ботом заново и нажмите кнопку меню. Telegram передаст
   подписанный `initData`, приложение проверит его и создаст httpOnly-сессию.

То же можно настроить через **Bot Settings → Menu Button → Configure menu
button**. Если меняете домен, обновите URL кнопки через `/setmenubutton`.

## Как устроена авторизация

1. Клиент получает `initData` только из Telegram Web App SDK.
2. `POST /api/auth/verify` проверяет HMAC, `auth_date` и наличие Telegram ID в
   `employees`.
3. Сервер создаёт подписанную cookie `selan_session` с `HttpOnly`, `SameSite=Lax`
   и сроком 24 часа.
4. На каждом защищённом запросе сервер проверяет подпись cookie, заново читает
   сотрудника и роль из Supabase и только затем выполняет операцию.

Telegram ID, имя отправителя и флаг администратора никогда не принимаются от
клиента как источник правды.
