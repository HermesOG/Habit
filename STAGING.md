# Тестовый стенд «Хранителя»

Стенд — это папка `D:\Claude Code\Habit-staging` (git worktree ветки `staging`), свой тестовый бот,
свой проект Vercel `habit-staging` и изолированная схема `staging` в том же Supabase.
Живые пользователи ничего из этого не видят. Понравилось на стенде → вливаем `staging` в прод.

Приложение по-прежнему хранит задачи только у пользователя (Telegram CloudStorage / localStorage);
сервер нужен боту (кому и когда напоминать) и владельцу (аналитика). Без переменных Supabase
стенд тоже работает — просто без напоминаний, настроек напоминаний, рефералов и воронки.

## Что уже сделано (ничего делать не нужно)

- ветка `staging` + worktree; все изменения закоммичены и запушены;
- схема `staging` и функции `public.stg_*` в Supabase, секрет стенда прописан;
- локальный просмотр: конфиг `khranitel-staging` в `.claude/launch.json` (порт 5603) или
  `python -m http.server 5603 --directory "D:/Claude Code/Habit-staging"`;
- сгенерированные секреты — в `.env.staging.local` (не в git).

## Что сделать один раз (около 15 минут)

### 1. Тестовый бот
В @BotFather: `/newbot` → имя «Хранитель · стенд», username например `sparky_tasks_stg_bot`.
Сохранить токен. Больше в BotFather ничего настраивать не нужно: кнопку меню и команды поставим командами ниже.

### 2. Проект Vercel `habit-staging`
Вариант А (рекомендуется, дальше всё само по пушу): установить GitHub-приложение Vercel для
репозитория HermesOG/Habit — https://github.com/apps/vercel — затем в Vercel «Add New → Project»,
импортировать `HermesOG/Habit`, имя `habit-staging`, после создания: Settings → Git → Production
Branch = `staging`. С этого момента каждый пуш в `staging` деплоит стенд.

Вариант Б (без GitHub-интеграции): в папке стенда
```powershell
npx vercel login
npx vercel --prod --yes
```
CLI сам создаст проект `habit-staging` по имени папки. Для каждого следующего деплоя — та же команда.
Внимание: CLI берёт файлы из папки, а не из git — перед деплоем `git status` должен быть чистым.

### 3. Переменные окружения (Vercel → habit-staging → Settings → Environment Variables)
Список с готовыми значениями — в `.env.staging.local`. Три значения добавить руками:
`TELEGRAM_BOT_TOKEN` (шаг 1), `BOT_USERNAME`, `SUPABASE_SERVICE_ROLE_KEY`
(Supabase → Project Settings → API → service_role). `WEBAPP_URL` — адрес стенда из шага 2
(обычно `https://habit-staging-fir29.vercel.app`). После добавления — Redeploy.

### 4. Вебхук и меню бота (PowerShell, подставить свои значения)
```powershell
$t = "ТОКЕН_ТЕСТОВОГО_БОТА"; $s = "TELEGRAM_WEBHOOK_SECRET из .env.staging.local"; $u = "https://habit-staging-fir29.vercel.app"
Invoke-RestMethod "https://api.telegram.org/bot$t/setWebhook" -Method Post -Body @{ url = "$u/api/bot"; secret_token = $s; drop_pending_updates = "true" }
Invoke-RestMethod "https://api.telegram.org/bot$t/setChatMenuButton" -Method Post -ContentType "application/json" -Body (@{ menu_button = @{ type = "web_app"; text = "Хранитель"; web_app = @{ url = $u } } } | ConvertTo-Json -Depth 5)
Invoke-RestMethod "https://api.telegram.org/bot$t/setMyCommands" -Method Post -ContentType "application/json" -Body (@{ commands = @(
  @{ command = "start";   description = "Разбудить Хранителя" },
  @{ command = "lang";    description = "Язык · Til · Language" },
  @{ command = "stop";    description = "Выключить напоминания" },
  @{ command = "privacy"; description = "Что хранится" },
  @{ command = "delete";  description = "Удалить мои данные" },
  @{ command = "help";    description = "Команды" }
) } | ConvertTo-Json -Depth 5)
```
Проверка: `Invoke-RestMethod "https://api.telegram.org/bot$t/getWebhookInfo"` — `last_error_message` пустой.

### 5. Ежечасные напоминания стенда (Supabase → SQL Editor)
```sql
select cron.schedule('nudge-hourly-staging', '0 * * * *', $$
  select net.http_post(
    url := 'https://habit-staging-fir29.vercel.app/api/nudge',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json',
      'x-nudge-secret', (select val from staging.bot_config where key = 'nudge_secret')),
    timeout_milliseconds := 55000);
$$);
```
Выключить: `select cron.unschedule('nudge-hourly-staging');`

## Проверка, что всё живо

1. В тестовом боте `/start` → выбор языка → история → кнопка открывает стенд.
2. Первый запуск ведёт через онбординг: имя → одна привычка → что дальше → «сегодня уже сделал(а)?».
   «Да» даёт второй уровень и церемонию «Хранитель открыл глаза». Повторить онбординг на том же
   аккаунте: удалить все привычки/задачи/цели и в консоли `localStorage.clear()` (в Telegram —
   очистить CloudStorage через /delete не поможет: данные приложения живут в CloudStorage; проще второй аккаунт).
   В Supabase после этого:
   `select user_id, tz, summary from staging.bot_users;` — появилась сводка;
   `select * from staging.events order by at desc;` — события `open`, `habit_created`, `check`.
3. Профиль → «Уведомления»: тумблеры и время сохраняются (`select morning_hour, evening_hour from staging.bot_users`).
4. Профиль → «Поделиться Хранителем» → карточка уходит в любой чат; ссылка в ней ведёт на тестового бота
   с `?start=ref_<ваш id>`. Открыть её со второго аккаунта — обоим +30 искр.
5. Ручной тест напоминания: `POST https://<стенд>/api/nudge?uid=<ваш chat_id>&kind=evening`
   с заголовком `x-nudge-secret`.
6. Дашборд: `https://<стенд>/api/stats` с заголовком `x-stats-key: <STATS_KEY>` (или `?key=`).

## Перенос на прод

1. Supabase → SQL Editor: применить `db/migrations/0002` … `0006` подряд (см. `db/README.md`).
2. Прописать в проде переменные `TELEGRAM_WEBHOOK_SECRET` (обязательна), `BOT_USERNAME`,
   `SUPABASE_SERVICE_ROLE_KEY` (до сих пор не задана — из-за этого аналитика не писалась), `STATS_KEY`.
3. Влить `staging` в ветку прода и задеплоить. Обновить команды бота (шаг 4, с токеном прода).
4. Cron `purge-inactive` создаётся миграцией 0006; `nudge-hourly` уже есть.

## Убрать стенд

`drop schema staging cascade;` и `drop function` для всех `public.stg_*` (список:
`select proname from pg_proc where proname like 'stg\_%';`), удалить проект `habit-staging` в Vercel,
удалить тестового бота в BotFather, `git worktree remove "D:/Claude Code/Habit-staging"`.
