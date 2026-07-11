// Telegram-бот «Хранитель»: webhook /api/bot.
// /start впервые — мини-история из трёх сообщений с паузами и «печатает…»;
// повторный /start — короткое «с возвращением»; любой другой текст — подсказка с кнопкой.
//
// Переменные окружения:
//   TELEGRAM_BOT_TOKEN        — токен бота (обязателен)
//   TELEGRAM_WEBHOOK_SECRET   — сверяется с заголовком X-Telegram-Bot-Api-Secret-Token
//   WEBAPP_URL                — адрес Mini App; по умолчанию прод-домен Vercel
//   GREETING_ANIMATION        — file_id или URL гифки: первое сообщение станет анимацией
//   UPSTASH_REDIS_REST_URL,
//   UPSTASH_REDIS_REST_TOKEN  — память «кто уже заходил»; без них все получают полную историю

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) console.log('TG_ERR ' + method + ' ' + JSON.stringify(data));
  return data;
}

async function redis(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/${cmd.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    return data.result;
  } catch (e) {
    console.log('REDIS_ERR ' + e.message);
    return null;
  }
}

function webappUrl() {
  if (process.env.WEBAPP_URL) return process.env.WEBAPP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

function openKeyboard() {
  const url = webappUrl();
  if (!url) return undefined;
  return { inline_keyboard: [[{ text: '🔥 Открыть Хранителя', web_app: { url } }]] };
}

async function typingPause(chatId, ms) {
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' });
  await sleep(ms);
}

async function sendStory(chatId, name) {
  const hello =
    `Здравствуй, ${esc(name)}.\n\n` +
    'Я — Хранитель. Маленький огонёк, который живёт твоими делами. ' +
    'Пока ты действуешь — я горю. Пока ты растёшь — расту и я.';

  if (process.env.GREETING_ANIMATION) {
    await tg('sendAnimation', { chat_id: chatId, animation: process.env.GREETING_ANIMATION, caption: hello, parse_mode: 'HTML' });
  } else {
    await tg('sendMessage', { chat_id: chatId, text: hello, parse_mode: 'HTML' });
  }

  await typingPause(chatId, 1800);
  await tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      'Всё просто: выполняешь задачи и привычки → получаешь искры ✨ → я набираю силу и меняю форму.\n\n' +
      'Серии дней делают искры ярче. Главное — не дать огню погаснуть.',
  });

  await typingPause(chatId, 1800);
  await tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: 'Зажги первую искру — добавь свою первую привычку. Я жду внутри 👇',
    reply_markup: openKeyboard(),
  });
}

async function sendWelcomeBack(chatId, name) {
  await tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: `С возвращением, ${esc(name)}. Огонь ещё горит 🔥`,
    reply_markup: openKeyboard(),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, bot: 'guardian' });

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(403).json({ ok: false });
  }

  try {
    const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const msg = update.message;
    if (!msg || !msg.chat || msg.chat.type !== 'private') return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;
    const name = (msg.from && msg.from.first_name) || 'путник';
    const text = msg.text || '';

    if (text.startsWith('/start')) {
      const seen = await redis(['GET', `seen:${chatId}`]);
      if (seen) {
        await sendWelcomeBack(chatId, name);
      } else {
        await sendStory(chatId, name);
        await redis(['SET', `seen:${chatId}`, '1']);
      }
    } else {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Я живу вон там 👇 Все дела, привычки и искры — внутри.',
        reply_markup: openKeyboard(),
      });
    }
  } catch (e) {
    console.log('BOT_ERR ' + e.message);
  }
  // Всегда 200 — иначе Telegram повторит update и история придёт дважды.
  return res.status(200).json({ ok: true });
}
