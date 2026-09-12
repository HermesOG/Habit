# Бот «Хранитель» — подключение webhook

Код бота: `api/bot.js` (Vercel serverless). Ниже — разовые шаги подключения.
Тестовый стенд (свой бот, своя схема в базе) — см. `STAGING.md`.

## Что изменилось в сентябре 2026

- **Подпись initData.** `/api/hit`, `/api/act`, `/api/event`, `/api/prefs`, `/api/share` принимают
  только подписанный `initData` (`api/_auth.js`); `uid` из тела больше не читается.
- **Секрет вебхука обязателен.** Без `TELEGRAM_WEBHOOK_SECRET` бот отвечает 500 и не обрабатывает апдейты.
- **Команды:** `/privacy` (ссылка на политику + короткая выжимка), `/delete` (с подтверждением —
  стирает всё серверное о пользователе: `bot_users`, `dau`, `events`), `/help`.
- **Рефералы:** `/start ref_<id>` — новичку и пригласившему по 30 искр (`record_referral`,
  бонус выдаётся через `/api/hit` → `pending_bonus`, приложение подтверждает `bonus_claimed`).
- **Адресные напоминания.** Приложение шлёт сводку (названия привычек, серии, сделано ли сегодня,
  расписание, число задач) — `bot_users.summary`. Вечером: «„Чтение“ — серия 6 дн., до конца дня есть
  время на шаг»; утром: список привычек и задач дня. Без сводки — прежние общие тексты.
- **Свой час.** `morning_hour` (5–12) и `evening_hour` (17–23) — экран «Уведомления» в приложении
  (`/api/prefs`). Окно отправки по-прежнему 3 часа от выбранного.
- **Заблокировавшие бота** (403) помечаются `blocked_at` и не дёргаются до следующего `/start`.
- **Функции `bot_*` только для `service_role`** — `SUPABASE_SERVICE_ROLE_KEY` обязателен.

Команды для `setMyCommands` теперь: start, lang, stop, privacy, delete, help (см. `STAGING.md`, шаг 4).

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
  commands = @(
    @{ command = "start"; description = "Разбудить Хранителя" },
    @{ command = "lang";  description = "Язык · Til · Language" }
  )
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
- `/stop` — притушить оба напоминания (утро+вечер); `/start` включает их снова.
- Любой другой текст: подсказка с кнопкой.

## Утреннее напоминание «доброе утро»

В 9:00 по **местному времени** — всем ежедневно (независимо от активности): пожелание доброго
дня + зов заглянуть в задачи. Кнопки «🔥 Открыть задачи» + «🔕 Не будить по утрам».
**Ротация.** Текст — случайный из 10 вариаций на языке пользователя (массивы `morning`
в `api/_i18n.js`, выбор — `morningCaption()`).
Гифка — случайная из `morning1..8.mp4`: env `MORNING_ANIMATION` содержит **несколько URL через
запятую**, `pickUrl()` выбирает одну. Добавить/убрать гифку = поправить список в env + redeploy
(файл положить в корень репо). Если env пуста — уходит текстом без гифки. То же работает и для
`NUDGE_ANIMATION` (вечернее), если захочется несколько.

Устройство — то же, что у вечернего, но отдельный канал:
- Колонки `bot_users`: `morning_enabled` (тумблер), `morning_day` (дедуп).
- RPC `bot_claim_morning` (локально 9:xx, включено, ещё не слали) и `bot_set_morning`.
- Тот же `/api/nudge` за один ежечасный тик обслуживает **оба** канала (утро и вечер).
- Отключение раздельное: кнопка «Не будить по утрам» гасит только утро; «Не напоминать» — только вечер; `/stop` — оба.

Ручной тест утреннего (одному сразу): `.../api/nudge?uid=<chat_id>&kind=morning` с заголовком `x-nudge-secret`.

## Надёжность доставки (фикс 2026-07-24)

Пользователи не получали уведомления. Четыре причины, все устранены:

| Причина | Было | Стало |
|---|---|---|
| Гифка по URL | Telegram скачивал видео заново каждый раз (~3 с на человека) → функция не укладывалась в лимит и молча бросала остальных | Кеш `file_id` в таблице `bot_media` (~0.3 с). Первая отправка по URL сохраняет `file_id`, дальше шлётся он |
| Пометка до отправки | `claim` помечал всех «уведомлён», и упавшие пропадали до завтра | `bot_unmark()` — откат пометки при неудаче |
| Окно ровно 1 час | `hour = 9` / `= 20`: сорвалось — второго шанса нет | Окно `9..11` и `20..22` → до 3 попыток |
| `tz IS NULL` | Нажал /start, но не открывал приложение → исключён навсегда | Подстановка `bot_config.default_tz` (сейчас `Asia/Tashkent`) |

Плюс `maxDuration: 60` у функции и `timeout_milliseconds := 55000` у pg_net (было 5 с).

Реальные часы срабатывания (UTC): Ташкент — утро 04–06, вечер 15–17; Цюрих — 07–09 и 18–20.

Сменить пояс по умолчанию:
```sql
update public.bot_config set val = 'Europe/Moscow' where key = 'default_tz';
```

Прогреть кеш гифки без спама (отправить и удалить) — см. `bot_media`; при добавлении новой
гифки первая отправка закеширует её автоматически.

## Вечернее напоминание «искра ослабла» (см. также утреннее ниже)

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

## Язык интерфейса (ru / uz / en)

Тексты бота и приложения живут раздельно, но язык — общий:

- **Бот** — `api/_i18n.js` (используют `api/bot.js` и `api/nudge.js`).
- **Приложение** — словарь `I18N` внутри `index.html`.

**Как выбирается.** На первом `/start` бот показывает пикер («Выбери язык · Tilni tanlang ·
Choose your language»); выбор пишется в `bot_users.lang` и только потом уходит приветственная
история — уже на нужном языке. Сменить позже: команда `/lang` или настройки приложения.
Пользователи, зарегистрированные до появления фичи, увидят пикер при следующем `/start`
(язык у них ещё не задан).

**Как язык попадает в Mini App.** Бот подставляет его в адрес кнопки: `WEBAPP_URL?lang=uz`
(см. `appUrl()` в `api/_i18n.js`). Приложение читает `?lang=` прямо в инициализаторе состояния,
поэтому первый кадр уже на нужном языке.

Приоритет в приложении, от высшего к низшему:

1. **Выбор в настройках приложения** — ставит флаг `langSet`, дальше `?lang=` игнорируется.
2. **Выбор в боте** — `?lang=` из адреса; применяется, пока `langSet` не выставлен.
3. **Язык Telegram** (`language_code`) — только на самом первом запуске, чтобы не переключать
   язык тем, кто уже пользуется приложением.

Имя героя по умолчанию переносится на новый язык (Хранитель / Qo'riqchi / Guardian), но только
если пользователь его не переименовывал.

**Напоминания.** `bot_claim_morning` / `bot_claim_nudges` возвращают `(uid, ulang)`, поэтому
утренние и вечерние сообщения уходят на языке получателя. Ручной тест одного пользователя:
`POST /api/nudge?uid=<id>&kind=morning&lang=uz` (без `lang` берётся сохранённый).

**Добавить язык:** код в `LANGS` + блок в `S` (`api/_i18n.js`), блок в `I18N` и запись в `LANGS`
(`index.html`), и разрешить код в `bot_set_lang` (миграция `bot_users_lang`).
