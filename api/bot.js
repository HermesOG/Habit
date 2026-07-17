// Telegram-бот «Хранитель»: webhook /api/bot.
// /start впервые — мини-история из трёх сообщений с паузами и «печатает…»;
// повторный /start — короткое «с возвращением» (факт первого захода хранится в Supabase,
// bot_users); /stop и кнопка «Не напоминать» гасят вечерние напоминания; /start их возвращает.
//
// Переменные окружения:
//   TELEGRAM_BOT_TOKEN        — токен бота (обязателен)
//   TELEGRAM_WEBHOOK_SECRET   — сверяется с заголовком X-Telegram-Bot-Api-Secret-Token
//   WEBAPP_URL                — адрес Mini App
//   GREETING_ANIMATION        — file_id или URL гифки приветствия
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — реестр bot_users (см. api/_supa.js)
import { supaRpc } from './_supa.js';

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

function openKeyboard() {
  const url = process.env.WEBAPP_URL;
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

async function handleMessage(msg) {
  if (!msg.chat || msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const name = (msg.from && msg.from.first_name) || 'путник';
  const text = msg.text || '';

  if (text.startsWith('/start')) {
    // deep-link из ссылки t.me/<bot>?start=<src> приходит как «/start <src>» —
    // фиксируем источник перехода (first-touch), напр. ?start=instagram.
    const src = (text.split(/\s+/)[1] || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (src) await supaRpc('record_source', { p_user_id: String(chatId), p_source: src, p_secret: process.env.NUDGE_SECRET });
    // bot_register возвращает true, если пользователь создан впервые. Заодно (re)включаем
    // оба канала напоминаний: «Разбудить Хранителя» логично снимает mute и утром, и вечером.
    const r = await supaRpc('bot_register', { p_user_id: String(chatId), p_tz: null, p_push: true, p_secret: process.env.NUDGE_SECRET });
    await supaRpc('bot_set_morning', { p_user_id: String(chatId), p_enabled: true, p_secret: process.env.NUDGE_SECRET });
    const isNew = r && r.data === true;
    if (isNew) await sendStory(chatId, name);
    else await sendWelcomeBack(chatId, name);
    return;
  }

  if (text.startsWith('/stop')) {
    await supaRpc('bot_set_push', { p_user_id: String(chatId), p_enabled: false, p_secret: process.env.NUDGE_SECRET });
    await supaRpc('bot_set_morning', { p_user_id: String(chatId), p_enabled: false, p_secret: process.env.NUDGE_SECRET });
    await tg('sendMessage', { chat_id: chatId, text: 'Напоминания притушены — и утренние, и вечерние. /start вернёт их.' });
    return;
  }

  await tg('sendMessage', {
    chat_id: chatId,
    text: 'Я живу вон там 👇 Все дела, привычки и искры — внутри.',
    reply_markup: openKeyboard(),
  });
}

// Кнопки отключения: mute — вечерние, mute_morning — утренние (раздельно). Гасим свой канал,
// отвечаем и убираем кнопку mute, оставляя возможность открыть приложение.
const MUTE = {
  mute:         { rpc: 'bot_set_push',    toast: 'Вечером больше не напомню 🔕 /start вернёт напоминания.', open: '🔥 Сделать шаг' },
  mute_morning: { rpc: 'bot_set_morning', toast: 'Утром больше не побеспокою 🔕 /start вернёт напоминания.', open: '🔥 Открыть задачи' },
};

async function handleCallback(cb) {
  const chatId = cb.message && cb.message.chat && cb.message.chat.id;
  const m = MUTE[cb.data];
  if (m && chatId) {
    await supaRpc(m.rpc, { p_user_id: String(chatId), p_enabled: false, p_secret: process.env.NUDGE_SECRET });
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: m.toast, show_alert: false });
    const url = process.env.WEBAPP_URL;
    if (cb.message && url) {
      await tg('editMessageReplyMarkup', {
        chat_id: chatId, message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: m.open, web_app: { url } }]] },
      });
    }
    return;
  }
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, bot: 'guardian' });

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(403).json({ ok: false });
  }

  try {
    const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
  } catch (e) {
    console.log('BOT_ERR ' + (e && e.message));
  }
  // Всегда 200 — иначе Telegram повторит update и история придёт дважды.
  return res.status(200).json({ ok: true });
}
