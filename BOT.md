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
- Повторно: короткое «С возвращением, {имя}. Огонь ещё горит 🔥» + кнопка (нужен Upstash, иначе снова полная история).
- Любой другой текст: подсказка с кнопкой.
