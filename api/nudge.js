// Тик напоминаний. Дёргается ежечасно планировщиком (pg_cron+pg_net в Supabase) и за один
// вызов обслуживает оба канала:
//   • утро (9:00 местного) — «доброе утро, загляни в задачи», всем с включённым утренним;
//   • вечер (20:00 местного) — «искра ослабла», тем, у кого сегодня не было ни одного шага.
// claim-функции атомарно выбирают и помечают получателей (антидубль по morning_day/nudged_day).
//
// Защита: заголовок x-nudge-secret (или ?secret=) == NUDGE_SECRET.
// Тест вручную: POST /api/nudge?uid=<id>&kind=morning|evening — одному сразу, минуя расписание.
//
// Env: TELEGRAM_BOT_TOKEN, NUDGE_SECRET, WEBAPP_URL, NUDGE_ANIMATION, MORNING_ANIMATION.
import { supaRpc } from './_supa.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EVENING_CAPTION =
  'Искра ослабла, но ещё не погасла.\n' +
  'До конца дня есть время на один маленький шаг — и я снова разгорюсь. 🔥';
const MORNING_CAPTION =
  'Доброе утро ☀️\n' +
  'Загляни в задачи на сегодня — прикинь, что важно успеть, и наметь первый шаг.\n' +
  'Пусть день будет ярким. Я рядом. 🔥';

function keyboard(openText, muteText, muteData) {
  const rows = [];
  const url = process.env.WEBAPP_URL;
  if (url) rows.push([{ text: openText, web_app: { url } }]);
  rows.push([{ text: muteText, callback_data: muteData }]);
  return { inline_keyboard: rows };
}

const CHANNELS = {
  evening: {
    caption: EVENING_CAPTION,
    anim: () => process.env.NUDGE_ANIMATION,
    kb: () => keyboard('🔥 Сделать шаг', '🔕 Не напоминать', 'mute'),
    claim: 'bot_claim_nudges',
  },
  morning: {
    caption: MORNING_CAPTION,
    anim: () => process.env.MORNING_ANIMATION,
    kb: () => keyboard('🔥 Открыть задачи', '🔕 Не будить по утрам', 'mute_morning'),
    claim: 'bot_claim_morning',
  },
};

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

async function send(chatId, ch) {
  const anim = ch.anim();
  const reply_markup = ch.kb();
  if (anim) return tg('sendAnimation', { chat_id: chatId, animation: anim, caption: ch.caption, reply_markup });
  return tg('sendMessage', { chat_id: chatId, text: ch.caption, reply_markup });
}

async function runChannel(ch) {
  const r = await supaRpc(ch.claim, { p_secret: process.env.NUDGE_SECRET });
  const targets = Array.isArray(r.data) ? r.data.map(String) : [];
  let sent = 0, failed = 0;
  for (const uid of targets) {
    if (await send(uid, ch)) sent++; else failed++;
    await sleep(40); // мягкий троттлинг под лимиты Telegram
  }
  return { targets: targets.length, sent, failed };
}

export default async function handler(req, res) {
  const secret = process.env.NUDGE_SECRET;
  const provided = req.headers['x-nudge-secret'] || (req.query && req.query.secret);
  if (secret && provided !== secret) { res.status(403).json({ ok: false }); return; }
  if (!process.env.TELEGRAM_BOT_TOKEN) { res.status(200).json({ ok: false, reason: 'no-token' }); return; }

  // Ручной тест: ?uid=<id>&kind=morning|evening — одному сразу, без расписания.
  const forceUid = req.query && req.query.uid ? String(req.query.uid) : null;
  if (forceUid) {
    const ch = CHANNELS[(req.query.kind || 'evening')] || CHANNELS.evening;
    const ok = await send(forceUid, ch);
    res.status(200).json({ ok: true, forced: true, kind: ch === CHANNELS.morning ? 'morning' : 'evening', sent: ok ? 1 : 0 });
    return;
  }

  // Расписание: оба канала за один тик (сработает лишь тот, где у пользователя сейчас нужный час).
  const morning = await runChannel(CHANNELS.morning);
  const evening = await runChannel(CHANNELS.evening);
  res.status(200).json({ ok: true, morning, evening });
}
