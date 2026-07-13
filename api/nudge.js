// Вечернее напоминание «искра ослабла». Дёргается ежечасно планировщиком (pg_cron+pg_net
// в Supabase). bot_claim_nudges() атомарно выбирает тех, у кого локально ~20:00, сегодня не
// было шага и напоминания включены — и сразу помечает их (антидубль). Каждому шлём гифку.
//
// Защита: заголовок x-nudge-secret (или ?secret=) должен совпасть с NUDGE_SECRET.
// Тест вручную: POST /api/nudge?uid=<id> с секретом — шлёт одному сразу, минуя расписание.
//
// Переменные окружения: TELEGRAM_BOT_TOKEN, NUDGE_SECRET, WEBAPP_URL, NUDGE_ANIMATION.
import { supaRpc } from './_supa.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAPTION =
  'Искра ослабла, но ещё не погасла.\n' +
  'До конца дня есть время на один маленький шаг — и я снова разгорюсь. 🔥';

function keyboard() {
  const rows = [];
  const url = process.env.WEBAPP_URL;
  if (url) rows.push([{ text: '🔥 Сделать шаг', web_app: { url } }]);
  rows.push([{ text: '🔕 Не напоминать', callback_data: 'mute' }]);
  return { inline_keyboard: rows };
}

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) console.log('NUDGE_TG_ERR ' + method + ' ' + JSON.stringify(data));
  return data.ok;
}

async function sendNudge(chatId) {
  const anim = process.env.NUDGE_ANIMATION;
  const reply_markup = keyboard();
  if (anim) {
    return tg('sendAnimation', { chat_id: chatId, animation: anim, caption: CAPTION, reply_markup });
  }
  return tg('sendMessage', { chat_id: chatId, text: CAPTION, reply_markup });
}

export default async function handler(req, res) {
  const secret = process.env.NUDGE_SECRET;
  const provided = req.headers['x-nudge-secret'] || (req.query && req.query.secret);
  if (secret && provided !== secret) { res.status(403).json({ ok: false }); return; }
  if (!process.env.TELEGRAM_BOT_TOKEN) { res.status(200).json({ ok: false, reason: 'no-token' }); return; }

  // Ручной тест: ?uid=<id> — одному сразу, без обращения к расписанию.
  const forceUid = req.query && req.query.uid ? String(req.query.uid) : null;
  let targets = [];
  if (forceUid) {
    targets = [forceUid];
  } else {
    const r = await supaRpc('bot_claim_nudges', { p_secret: process.env.NUDGE_SECRET });
    targets = Array.isArray(r.data) ? r.data.map(String) : [];
  }

  let sent = 0, failed = 0;
  for (const uid of targets) {
    const ok = await sendNudge(uid);
    if (ok) sent++; else failed++;
    await sleep(40); // мягкий троттлинг под лимиты Telegram
  }
  res.status(200).json({ ok: true, targets: targets.length, sent, failed, forced: !!forceUid });
}
