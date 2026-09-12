// Telegram-бот «Хранитель»: webhook /api/bot.
// Первый /start — выбор языка, затем мини-история из трёх сообщений с паузами и «печатает…»;
// повторный /start — короткое «с возвращением». /stop гасит оба напоминания; /start возвращает.
// /privacy — что хранится; /delete — стереть всё серверное о пользователе (право на удаление);
// /help — список команд. Deep-link /start ref_<id> — реферал: бонус обоим (миграция 0005).
//
// Переменные окружения:
//   TELEGRAM_BOT_TOKEN        — токен бота (обязателен)
//   TELEGRAM_WEBHOOK_SECRET   — ОБЯЗАТЕЛЕН: сверяется с заголовком X-Telegram-Bot-Api-Secret-Token
//   WEBAPP_URL                — адрес Mini App
//   GREETING_ANIMATION        — file_id или URL гифки приветствия
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NUDGE_SECRET — реестр bot_users (см. api/_supa.js)
import { supaRpc } from './_supa.js';
import { tg } from './_tg.js';
import { t, normLang, LANG_LABELS, LANG_PROMPT, appUrl } from './_i18n.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const S = () => process.env.NUDGE_SECRET;
const REF = /^ref_(\d{3,20})$/;

function openKeyboard(lang) {
  const url = appUrl(lang);
  if (!url) return undefined;
  return { inline_keyboard: [[{ text: t(lang, 'open'), web_app: { url } }]] };
}

// mode кодируется в callback_data, чтобы после выбора языка знать, что слать дальше:
// n — новичок (полная история), r — вернувшийся (короткое приветствие), s — просто смена языка.
function langKeyboard(mode) {
  return {
    inline_keyboard: ['ru', 'uz', 'en'].map((c) => [
      { text: LANG_LABELS[c], callback_data: 'lang:' + c + ':' + mode },
    ]),
  };
}

async function readLang(chatId) {
  const r = await supaRpc('bot_get_lang', { p_user_id: String(chatId), p_secret: S() });
  const raw = r && r.data;
  return typeof raw === 'string' && raw ? normLang(raw) : null; // null — язык ещё не выбран
}

async function typingPause(chatId, ms) {
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' });
  await sleep(ms);
}

async function sendStory(chatId, name, lang) {
  const hello = t(lang, 'story1', { name: esc(name || t(lang, 'defaultName')) });
  if (process.env.GREETING_ANIMATION) {
    await tg('sendAnimation', { chat_id: chatId, animation: process.env.GREETING_ANIMATION, caption: hello, parse_mode: 'HTML' });
  } else {
    await tg('sendMessage', { chat_id: chatId, text: hello, parse_mode: 'HTML' });
  }
  await typingPause(chatId, 1800);
  await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: t(lang, 'story2') });
  await typingPause(chatId, 1800);
  await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: t(lang, 'story3'), reply_markup: openKeyboard(lang) });
}

async function sendWelcomeBack(chatId, name, lang) {
  await tg('sendMessage', {
    chat_id: chatId, parse_mode: 'HTML',
    text: t(lang, 'welcomeBack', { name: esc(name || t(lang, 'defaultName')) }),
    reply_markup: openKeyboard(lang),
  });
}

async function handleStart(chatId, name, text) {
  const uid = String(chatId);
  // deep-link t.me/<bot>?start=<arg> приходит как «/start <arg>»: источник (instagram…) или реферал ref_<id>
  const arg = (text.split(/\s+/)[1] || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const ref = REF.exec(arg);
  // bot_register возвращает true, если пользователь создан впервые; заодно снимает блокировку
  // и включает оба канала: «разбудить Хранителя» логично снимает mute и утром, и вечером.
  const r = await supaRpc('bot_register', { p_user_id: uid, p_tz: null, p_push: true, p_secret: S() });
  await supaRpc('bot_set_morning', { p_user_id: uid, p_enabled: true, p_secret: S() });
  const isNew = r && r.data === true;
  if (ref && ref[1] !== uid) {
    await supaRpc('record_source', { p_user_id: uid, p_source: 'referral', p_secret: S() });
    const rr = await supaRpc('record_referral', { p_user_id: uid, p_referrer: ref[1], p_secret: S() });
    const d = rr.ok && rr.data && typeof rr.data === 'object' ? rr.data : null;
    if (d && d.is_new) {
      const lr = await supaRpc('bot_get_lang', { p_user_id: ref[1], p_secret: S() });
      await tg('sendMessage', { chat_id: ref[1], text: t(normLang(lr && lr.data), 'refJoined', { n: d.bonus }) });
    }
  } else if (arg) {
    await supaRpc('record_source', { p_user_id: uid, p_source: arg, p_secret: S() });
  }
  const lang = await readLang(chatId);
  if (!lang) {
    await tg('sendMessage', { chat_id: chatId, text: LANG_PROMPT, reply_markup: langKeyboard(isNew ? 'n' : 'r') });
    return;
  }
  if (isNew) await sendStory(chatId, name, lang);
  else await sendWelcomeBack(chatId, name, lang);
}

async function handleMessage(msg) {
  if (!msg.chat || msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const name = (msg.from && msg.from.first_name) || '';
  const text = msg.text || '';
  const cmd = (text.split(/[\s@]/)[0] || '').toLowerCase();

  if (cmd === '/start') { await handleStart(chatId, name, text); return; }

  if (cmd === '/lang') {
    await tg('sendMessage', { chat_id: chatId, text: LANG_PROMPT, reply_markup: langKeyboard('s') });
    return;
  }

  const lang = await readLang(chatId);

  if (cmd === '/stop') {
    await supaRpc('bot_set_push', { p_user_id: String(chatId), p_enabled: false, p_secret: S() });
    await supaRpc('bot_set_morning', { p_user_id: String(chatId), p_enabled: false, p_secret: S() });
    await tg('sendMessage', { chat_id: chatId, text: t(lang, 'stopped') });
    return;
  }

  if (cmd === '/privacy') {
    const base = String(process.env.WEBAPP_URL || '').replace(/\/$/, '');
    await tg('sendMessage', { chat_id: chatId, text: t(lang, 'privacy', { url: base + '/privacy?lang=' + normLang(lang) }), disable_web_page_preview: true });
    return;
  }

  if (cmd === '/delete') {
    await tg('sendMessage', {
      chat_id: chatId, text: t(lang, 'deleteAsk'),
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'deleteYes'), callback_data: 'del:yes' }, { text: t(lang, 'deleteNo'), callback_data: 'del:no' }]] },
    });
    return;
  }

  if (cmd === '/help') {
    await tg('sendMessage', { chat_id: chatId, text: t(lang, 'help'), reply_markup: openKeyboard(lang) });
    return;
  }

  await tg('sendMessage', { chat_id: chatId, text: t(lang, 'fallback'), reply_markup: openKeyboard(lang) });
}

// Кнопки отключения: mute — вечерние, mute_morning — утренние (раздельно). Гасим свой канал,
// отвечаем и убираем кнопку mute, оставляя возможность открыть приложение.
const MUTE = {
  mute:         { rpc: 'bot_set_push',    toast: 'muteEveningToast', open: 'openStep' },
  mute_morning: { rpc: 'bot_set_morning', toast: 'muteMorningToast', open: 'openTasks' },
};

async function handleCallback(cb) {
  const chatId = cb.message && cb.message.chat && cb.message.chat.id;
  if (!chatId) { await tg('answerCallbackQuery', { callback_query_id: cb.id }); return; }
  const data = String(cb.data || '');

  // Выбор языка: сохраняем и досылаем то, ради чего показывали пикер (см. langKeyboard).
  if (data.indexOf('lang:') === 0) {
    const parts = data.split(':');
    const lang = normLang(parts[1]);
    const mode = parts[2] || 's';
    await supaRpc('bot_set_lang', { p_user_id: String(chatId), p_lang: lang, p_secret: S() });
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, 'langSaved') });
    await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t(lang, 'langSaved') });
    const name = (cb.from && cb.from.first_name) || '';
    if (mode === 'n') await sendStory(chatId, name, lang);
    else if (mode === 'r') await sendWelcomeBack(chatId, name, lang);
    else await tg('sendMessage', { chat_id: chatId, text: t(lang, 'langHint'), reply_markup: openKeyboard(lang) });
    return;
  }

  if (data === 'del:yes' || data === 'del:no') {
    const lang = await readLang(chatId);
    if (data === 'del:yes') await supaRpc('bot_delete_user', { p_user_id: String(chatId), p_secret: S() });
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t(lang, data === 'del:yes' ? 'deleteDone' : 'deleteCancel') });
    return;
  }

  const m = MUTE[data];
  if (m) {
    const lang = await readLang(chatId);
    await supaRpc(m.rpc, { p_user_id: String(chatId), p_enabled: false, p_secret: S() });
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, m.toast), show_alert: false });
    const url = appUrl(lang);
    if (url) {
      await tg('editMessageReplyMarkup', {
        chat_id: chatId, message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: t(lang, m.open), web_app: { url } }]] },
      });
    }
    return;
  }
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, bot: 'guardian' });

  // Секрет вебхука обязателен: без него любой, кто узнал адрес, шлёт боту «обновления».
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) { console.log('BOT_MISCONFIG нет TELEGRAM_WEBHOOK_SECRET'); return res.status(500).json({ ok: false }); }
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(403).json({ ok: false });

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
