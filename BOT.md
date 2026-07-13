# Бот «Хранитель» — подключение webhook

Код бота: `api/bot.js` (Vercel serverless). Ниже — разовые шаги подключения.

## 1. Переменные окружения в Vercel (Project → Settings → Environment Variables)

| Переменная | Что это |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен из @BotFather (обязательно) |
| `TELEGRAM_WEBHOOK_SECRET` | любая случайная строка — защита вебхука (рекомендуется) |
| `WEBAPP_URL` | адрес Mini App — задать явно `https://habit-sigma-wine.vercel.app`: часть прод-доменов проекта закрыта Vercel Authentication, публичен именно этот алиас |
| `GREETING_ANIMATION` | ✅ уже задана: `https://habit-sigma-wine.vercel.app/greeting.mp4` (рендер из `uploads/form1_amber_c.png`, скрипт-однодневка; заменить — просто перезаписать значение) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | память «кто уже заходил» (без них все получают полную историю) |

После добавления переменных — Redeploy, иначе функция их не увидит.

## 2. Привязать webhook (PowerShell, подставить свои значения)

```powershell
$t = "СЮДА_ТОКЕН"; $s = "СЮДА_СЕКРЕТ"; $u = "https://habit-sigma-wine.vercel.app/api/bot"
Invoke-RestMethod "https://api.telegram.org/bot$t/setWebhook" -Method Post -Body @{
  url = $u; secret_token = $s; drop_pending_updates = "true"
}
```

Проверка: `Invoke-RestMethod "https://api.telegram.org/bot$t/getWebhookInfo"` — в `url` должен быть наш адрес, `last_error_message` пустой.

## 3. Кнопка меню чата, команды, описание

```powershell
# Кнопка меню (слева от поля ввода) открывает Mini App
Invoke-RestMethod "https://api.telegram.org/bot$t/setChatMenuButton" -Method Post -ContentType "application/json" -Body (@{
  menu_button = @{ type = "web_app"; text = "Хранитель"; web_app = @{ url = "https://habit-sigma-wine.vercel.app" } }
} | ConvertTo-Json -Depth 5)

# Команды
Invoke-RestMethod "https://api.telegram.org/bot$t/setMyCommands" -Method Post -ContentType "application/json" -Body (@{
  commands = @(@{ command = "start"; description = "Разбудить Хранителя" })
} | ConvertTo-Json -Depth 5)

# Описания (что видно до нажатия Start и в профиле бота)
Invoke-RestMethod "https://api.telegram.org/bot$t/setMyDescription" -Method Post -Body @{
  description = "Хранитель — огонёк, который растёт от твоих дел. Задачи, привычки, цели и искры — внутри."
}
Invoke-RestMethod "https://api.telegram.org/bot$t/setMyShortDescription" -Method Post -Body @{
  short_description = "Трекер привычек с живым Хранителем огня"
}
```

## 4. Гифка приветствия (позже)

Отправить гифку боту @RawDataBot (или любым способом получить `file_id`), либо положить
файл в репозиторий и указать публичный URL. Значение — в переменную `GREETING_ANIMATION`,
Redeploy. Первое сообщение истории автоматически станет анимацией с подписью.

## Как работает /start

- Первый раз: 3 сообщения с паузами ~1.8 с и «печатает…» (лор → механика → призыв + кнопка «🔥 Открыть Хранителя»).
- Повторно: короткое «С возвращением, {имя}. Огонь ещё горит 🔥» + кнопка. Факт первого захода хранится в Supabase (`bot_users`).
- `/stop` — притушить вечерние напоминания; `/start` включает их снова.
- Любой другой текст: подсказка с кнопкой.

## Вечернее напоминание «искра ослабла»

Если в 20:00 по **местному времени** пользователя за день не было ни одного действия
(привычка / задача / шаг цели), бот шлёт гифку `nudge.mp4` с текстом-подбадриванием и
кнопками «🔥 Сделать шаг» + «🔕 Не напоминать».

Как устроено:
- Приложение шлёт `/api/hit` (заход, регистрирует пояс) и `/api/act` (был шаг сегодня) — см. `index.html`, метод `_actionPing` в `_grantXp`.
- Данные — в Supabase `public.bot_users` (`tz`, `last_action_day`, `nudged_day`, `push_enabled`).
  RPC `bot_register / bot_mark_action / bot_set_push / bot_claim_nudges` защищены секретом
  (`bot_config.nudge_secret` = env `NUDGE_SECRET`), поэтому доступны по публичному anon-ключу.
- Планировщик — **pg_cron** в Supabase (job `nudge-hourly`, `0 * * * *` UTC) через **pg_net**
  дёргает `/api/nudge`. `bot_claim_nudges()` атомарно берёт тех, у кого локально 20:xx, нет
  шага и включены напоминания, и помечает их (антидубль). НЕ зависит от тарифа Vercel.
- Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NUDGE_SECRET`, `NUDGE_ANIMATION`, `TELEGRAM_BOT_TOKEN`, `WEBAPP_URL`.

Ручной тест (одному сразу, минуя расписание):
```powershell
$s="<NUDGE_SECRET>"; Invoke-RestMethod "https://habit-sigma-wine.vercel.app/api/nudge?uid=<chat_id>" -Method Post -Headers @{ "x-nudge-secret"=$s }
```

Изменить расписание/выключить:
```sql
select cron.unschedule('nudge-hourly');           -- выключить
select * from cron.job;                            -- посмотреть задачи
```
