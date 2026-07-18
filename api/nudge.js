// Тик напоминаний. Дёргается ежечасно планировщиком (pg_cron+pg_net в Supabase) и за один
// вызов обслуживает оба канала:
//   • утро (9:00 местного) — «доброе утро, загляни в задачи», всем с включённым утренним;
//   • вечер (20:00 местного) — «искра ослабла», тем, у кого сегодня не было ни одного шага.
// claim-функции атомарно выбирают и помечают получателей (антидубль по morning_day/nudged_day)
// и отдают язык каждого — тексты уходят на языке пользователя (см. api/_i18n.js).
//
// Защита: заголовок x-nudge-secret (или ?secret=) == NUDGE_SECRET.
// Тест вручную: POST /api/nudge?uid=<id>&kind=morning|evening[&lang=ru|uz|en] — одному сразу.
//
// Env: TELEGRAM_BOT_TOKEN, NUDGE_SECRET, WEBAPP_URL, NUDGE_ANIMATION, MORNING_ANIMATION.
import { supaRpc } from './_supa.js';
import { t, normLang, morningCaption, appUrl } from './_i18n.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// В *_ANIMATION можно перечислить несколько URL через запятую — тогда ротируется и гифка.
const pickUrl = (v) => {
  const list = String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? pick(list) : null;
};

function keyboard(lang, openKey, muteKey, muteData) {
  const rows = [];
  const url = appUrl(lang);
  if (url) rows.push([{ text: t(lang, openKey), web_app: { url } }]);
  rows.push([{ text: t(lang, muteKey), callback_data: muteData }]);
  return { inline_keyboard: rows };
}

const CHANNELS = {
  evening: {
    cap: (lang) => t(lang, 'evening'),
    anim: () => pickUrl(process.env.NUDGE_ANIMATION),
    kb: (lang) => keyboard(lang, 'openStep', 'muteEvening', 'mute'),
    claim: 'bot_claim_nudges',
  },
  morning: {
    cap: (lang) => morningCaption(lang),
    anim: () => pickUrl(process.env.MORNING_ANIMATION),
    kb: (lang) => keyboard(lang, 'openTasks', 'muteMorning', 'mute_morning'),
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

async function send(chatId, ch, lang) {
  const anim = ch.anim();
  const caption = ch.cap(lang);
  const reply_markup = ch.kb(lang);
  if (anim) return tg('sendAnimation', { chat_id: chatId, animation: anim, caption, reply_markup });
  return tg('sendMessage', { chat_id: chatId, text: caption, reply_markup });
}

async function runChannel(ch) {
  const r = await supaRpc(ch.claim, { p_secret: process.env.NUDGE_SECRET });
  const rows = Array.isArray(r.data) ? r.data : [];
  let sent = 0, failed = 0;
  for (const row of rows) {
    // claim отдаёт {uid, ulang}; голую строку поддерживаем на случай, если код
    // выкатился раньше миграции — тогда просто уходит русский текст, а не «[object Object]».
    const uid = typeof row === 'string' ? row : String((row && row.uid) || '');
    const lang = typeof row === 'string' ? 'ru' : normLang(row && row.ulang);
    if (!uid) { failed++; continue; }
    if (await send(uid, ch, lang)) sent++; else failed++;
    await sleep(40); // мягкий троттлинг под лимиты Telegram
  }
  return { targets: rows.length, sent, failed };
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
    let lang = req.query && req.query.lang ? normLang(req.query.lang) : null;
    if (!lang) {
      const lr = await supaRpc('bot_get_lang', { p_user_id: forceUid, p_secret: process.env.NUDGE_SECRET });
      lang = normLang(lr && lr.data);
    }
    const ok = await send(forceUid, ch, lang);
    res.status(200).json({ ok: true, forced: true, kind: ch === CHANNELS.morning ? 'morning' : 'evening', lang, sent: ok ? 1 : 0 });
    return;
  }

  // Расписание: оба канала за один тик (сработает лишь тот, где у пользователя сейчас нужный час).
  const morning = await runChannel(CHANNELS.morning);
  const evening = await runChannel(CHANNELS.evening);
  res.status(200).json({ ok: true, morning, evening });
}
