# Тестовый стенд «Хранителя»

**Адрес стенда: https://habit-staging.vercel.app** (проект `habit-staging`, Vercel-аккаунт
`useaiforfree2222-2507`; прод живёт в другом аккаунте, `fir29`, и не затрагивается).

Стенд — это папка `D:\Claude Code\Habit-staging` (git worktree ветки `staging`), свой проект Vercel,
изолированная схема `staging` в том же Supabase и, когда вы его создадите, свой тестовый бот.
Понравилось на стенде → вливаем `staging` в прод.

Приложение по-прежнему хранит задачи только у пользователя (Telegram CloudStorage / localStorage);
сервер нужен боту (кому и когда напоминать) и владельцу (аналитика). Пока в проекте нет токена бота
и сервисного ключа Supabase, стенд работает как «браузерная» версия: всё, кроме напоминаний,
настроек напоминаний, рефералов и воронки.

## Что уже сделано

- ветка `staging` + worktree; всё закоммичено и запушено в GitHub;
- проект Vercel `habit-staging` создан и задеплоен, папка слинкована (`.vercel/project.json`);
- переменные окружения production уже заданы: `NUDGE_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `STATS_KEY`,
  `RPC_PREFIX=stg_`, `SUPABASE_URL`, `WEBAPP_URL`, `STATS_TZ`, `GREETING_ANIMATION`,
  `MORNING_ANIMATION`, `NUDGE_ANIMATION` (значения секретов — в `.env.staging.local`, не в git);
- схема `staging` и функции `public.stg_*` в Supabase, секрет стенда прописан;
- локальный просмотр: конфиг `khranitel-staging` в `.claude/launch.json` (порт 5603) или
  `python -m http.server 5603 --directory "D:/Claude Code/Habit-staging"`.

## Как обновить стенд

```powershell
cd "D:\Claude Code\Habit-staging"
git status          # должно быть чисто: CLI берёт файлы из папки, а не из git
npx vercel deploy --prod --yes
```

## Что сделать один раз, чтобы заработали бот и напоминания (около 10 минут)

### 1. Тестовый бот
В @BotFather: `/newbot` → имя «Хранитель · стенд», username например `sparky_tasks_stg_bot`. Сохранить токен.

### 2. Три переменные в Vercel
Vercel → `habit-staging` → Settings → Environment Variables (Production):
`TELEGRAM_BOT_TOKEN` (шаг 1), `BOT_USERNAME` (без @), `SUPABASE_SERVICE_ROLE_KEY`
(Supabase → Project Settings → API → service_role). Затем передеплоить (команда выше).

### 3. Вебхук и меню бота (PowerShell, подставить токен и секрет из `.env.staging.local`)
```powershell
$t = "ТОКЕН_ТЕСТОВОГО_БОТА"; $s = "TELEGRAM_WEBHOOK_SECRET"; $u = "https://habit-staging.vercel.app"
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

### 4. Ежечасные напоминания стенда (Supabase → SQL Editor)
```sql
select cron.schedule('nudge-hourly-staging', '0 * * * *', $$
  select net.http_post(
    url := 'https://habit-staging.vercel.app/api/nudge',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json',
      'x-nudge-secret', (select val from staging.bot_config where key = 'nudge_secret')),
    timeout_milliseconds := 55000);
$$);
```
Выключить: `select cron.unschedule('nudge-hourly-staging');`

## Проверка, что всё живо

1. Открыть https://habit-staging.vercel.app в браузере: онбординг (имя → одна привычка → что дальше →
   «сегодня уже сделал(а)?»); «Да» даёт второй уровень и церемонию «Хранитель открыл глаза».
   Повторить онбординг: в консоли браузера `localStorage.clear()` и перезагрузить.
2. После шагов 1–3: в тестовом боте `/start` → выбор языка → история → кнопка открывает стенд внутри Telegram.
   В Supabase: `select user_id, tz, summary from staging.bot_users;` — появилась сводка;
   `select * from staging.events order by at desc;` — события `open`, `onb_1..3`, `habit_created`, `check`.
3. Профиль → «Уведомления»: тумблеры и время сохраняются (`select morning_hour, evening_hour from staging.bot_users`).
4. Профиль → «Поделиться Хранителем» → карточка уходит в любой чат; ссылка в ней ведёт на тестового бота
   с `?start=ref_<ваш id>`. Открыть её со второго аккаунта — обоим +30 искр.
5. Ручной тест напоминания: `POST https://habit-staging.vercel.app/api/nudge?uid=<ваш chat_id>&kind=evening`
   с заголовком `x-nudge-secret`.
6. Дашборд: `https://habit-staging.vercel.app/api/stats` с заголовком `x-stats-key: <STATS_KEY>` (или `?key=`).

## Перенос на прод

1. Supabase → SQL Editor: применить `db/migrations/0002` … `0006` подряд (см. `db/README.md`).
2. Прописать в проде переменные `TELEGRAM_WEBHOOK_SECRET` (обязательна), `BOT_USERNAME`,
   `SUPABASE_SERVICE_ROLE_KEY` (до сих пор не задана — из-за этого аналитика не писалась), `STATS_KEY`.
3. Влить `staging` в ветку прода и задеплоить из основной папки. Обновить команды бота (шаг 3, с токеном прода).
4. Cron `purge-inactive` создаётся миграцией 0006; `nudge-hourly` уже есть.

## Убрать стенд

`drop schema staging cascade;` и `drop function` для всех `public.stg_*` (список:
`select proname from pg_proc where proname like 'stg\_%';`), удалить проект `habit-staging` в Vercel,
удалить тестового бота в BotFather, `git worktree remove "D:/Claude Code/Habit-staging"`.
