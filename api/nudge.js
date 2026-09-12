// Тик напоминаний. Дёргается ежечасно планировщиком (pg_cron+pg_net в Supabase) и за один
// вызов обслуживает оба канала:
//   • утро (час выбирает пользователь, по умолчанию 9:00 местного) — список привычек и задач на день;
//   • вечер (по умолчанию 20:00) — тем, у кого сегодня не было ни одного шага: какая серия под угрозой.
// Тексты строятся из сводки состояния (bot_users.summary, шлёт /api/act); без сводки — общий текст.
// claim-функции атомарно выбирают и помечают получателей (антидубль по morning_day/nudged_day),
// окно 3 часа — до 3 попыток. Заблокировавшие бота (403) помечаются и больше не дёргаются.
//
// Защита: заголовок x-nudge-secret (или ?secret=) == NUDGE_SECRET — обязателен.
// Тест вручную: POST /api/nudge?uid=<id>&kind=morning|evening[&lang=ru|uz|en] — одному сразу.
//
// Env: TELEGRAM_BOT_TOKEN, NUDGE_SECRET, WEBAPP_URL, NUDGE_ANIMATION, MORNING_ANIMATION.
import { supaRpc } from './_supa.js';
import { tg, tgFailKind, localDow } from './_tg.js';
import { t, normLang, morningCaption, appUrl, listJoin, pluTasks } from './_i18n.js';

// Запас времени: по умолчанию функцию убивало на 10-й секунде — при нескольких получателях
// часть оставалась помеченной, но без сообщения. С кешем file_id рассылка укладывается легко.
export const config = { maxDuration: 60 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = () => process.env.NUDGE_SECRET;
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

/* ---- адресные тексты по сводке ---- */
function dueToday(h, tz) {
  if (h.sch === 'days' && Array.isArray(h.days) && h.days.length) return h.days.indexOf(localDow(tz)) >= 0;
  return true;
}
export function eveningText(lang, sum, tz) {
  const hs = sum && Array.isArray(sum.h) ? sum.h.filter((h) => h && h.n && !h.d && dueToday(h, tz)) : [];
  if (!hs.length) return t(lang, 'evening');
  const top = hs.slice().sort((a, b) => (b.s | 0) - (a.s | 0))[0];
  if ((top.s | 0) >= 2) return t(lang, 'eveningStreak', { habit: top.n, streak: top.s });
  return t(lang, 'eveningHabit', { habit: top.n });
}
export function morningText(lang, sum, tz) {
  const hs = sum && Array.isArray(sum.h) ? sum.h.filter((h) => h && h.n && dueToday(h, tz)) : [];
  const tasks = sum ? (sum.t | 0) : 0;
  if (!hs.length && !tasks) return morningCaption(lang);
  if (!hs.length) return t(lang, 'morningOnlyTasks', { n: tasks, w: pluTasks(lang, tasks) });
  let list = listJoin(lang, hs.slice(0, 3).map((h) => '«' + h.n + '»'));
  if (hs.length > 3) list += t(lang, 'andMore', { n: hs.length - 3 });
  const tail = tasks ? t(lang, 'morningTasks', { n: tasks, w: pluTasks(lang, tasks) }) : '';
  return t(lang, 'morningList', { list, tail });
}

const CHANNELS = {
  evening: {
    cap: (lang, sum, tz) => eveningText(lang, sum, tz),
    anim: () => pickUrl(process.env.NUDGE_ANIMATION),
    kb: (lang) => keyboard(lang, 'openStep', 'muteEvening', 'mute'),
    claim: 'bot_claim_nudges',
  },
  morning: {
    cap: (lang, sum, tz) => morningText(lang, sum, tz),
    anim: () => pickUrl(process.env.MORNING_ANIMATION),
    kb: (lang) => keyboard(lang, 'openTasks', 'muteMorning', 'mute_morning'),
    claim: 'bot_claim_morning',
  },
};

/* Кеш file_id. Отправка гифки по URL заставляет Telegram КАЖДЫЙ раз скачивать видео с нашего
   сервера (~3 с на одного). Первая отправка по URL возвращает file_id, дальше шлём его (~0.2 с).
   Кеш общий на все инстансы (таблица bot_media), в памяти — на время одного вызова. */
const mediaCache = new Map();
async function loadMedia() {
  const r = await supaRpc('media_all', { p_secret: S() });
  if (Array.isArray(r.data)) for (const m of r.data) if (m && m.url) mediaCache.set(m.url, m.file_id);
}
async function rememberMedia(url, fileId) {
  mediaCache.set(url, fileId);
  await supaRpc('media_put', { p_url: url, p_file_id: fileId, p_secret: S() });
}

// Возвращает 'ok' | 'blocked' | 'fail'.
async function send(chatId, ch, lang, sum, tz) {
  const url = ch.anim();
  const caption = ch.cap(lang, sum, tz);
  const reply_markup = ch.kb(lang);
  if (!url) {
    const r = await tg('sendMessage', { chat_id: chatId, text: caption, reply_markup });
    return r.ok ? 'ok' : tgFailKind(r) === 'blocked' ? 'blocked' : 'fail';
  }
  const cached = mediaCache.get(url);
  const res = await tg('sendAnimation', { chat_id: chatId, animation: cached || url, caption, reply_markup });
  if (res.ok) {
    const fid = res.result && res.result.animation && res.result.animation.file_id;
    if (!cached && fid) await rememberMedia(url, fid);
    return 'ok';
  }
  if (tgFailKind(res) === 'blocked') return 'blocked';
  // Протухший file_id (редко, но бывает) — один повтор по исходному URL.
  if (cached) {
    mediaCache.delete(url);
    const retry = await tg('sendAnimation', { chat_id: chatId, animation: url, caption, reply_markup });
    if (retry.ok) {
      const fid = retry.result && retry.result.animation && retry.result.animation.file_id;
      if (fid) await rememberMedia(url, fid);
      return 'ok';
    }
    if (tgFailKind(retry) === 'blocked') return 'blocked';
  }
  return 'fail';
}

async function runChannel(ch, kind) {
  const r = await supaRpc(ch.claim, { p_secret: S() });
  const rows = Array.isArray(r.data) ? r.data : [];
  let sent = 0, failed = 0, blocked = 0;
  for (const row of rows) {
    const uid = String((row && row.uid) || '');
    const lang = normLang(row && row.ulang);
    if (!uid) { failed++; continue; }
    const out = await send(uid, ch, lang, row && row.usummary, row && row.utz);
    if (out === 'ok') sent++;
    else if (out === 'blocked') {
      // Человек заблокировал бота или удалил аккаунт — больше не дёргаем (до следующего /start).
      blocked++;
      await supaRpc('bot_set_blocked', { p_user_id: uid, p_secret: S() });
    } else {
      failed++;
      // Снимаем пометку — иначе человек уже «уведомлён» и сегодня попытки не повторятся.
      // Окно claim'а длится 3 часа, поэтому следующий ежечасный тик попробует снова.
      await supaRpc('bot_unmark', { p_user_id: uid, p_kind: kind, p_secret: S() });
    }
    await sleep(40); // мягкий троттлинг под лимиты Telegram
  }
  return { targets: rows.length, sent, failed, blocked };
}

export default async function handler(req, res) {
  const secret = process.env.NUDGE_SECRET;
  if (!secret) { console.log('NUDGE_MISCONFIG нет NUDGE_SECRET'); res.status(500).json({ ok: false, reason: 'no-secret' }); return; }
  const provided = req.headers['x-nudge-secret'] || (req.query && req.query.secret);
  if (provided !== secret) { res.status(403).json({ ok: false }); return; }
  if (!process.env.TELEGRAM_BOT_TOKEN) { res.status(500).json({ ok: false, reason: 'no-token' }); return; }

  // Ручной тест: ?uid=<id>&kind=morning|evening — одному сразу, без расписания.
  const forceUid = req.query && req.query.uid ? String(req.query.uid) : null;
  if (forceUid) {
    const ch = CHANNELS[(req.query.kind || 'evening')] || CHANNELS.evening;
    const pr = await supaRpc('bot_get_prefs', { p_user_id: forceUid, p_secret: secret });
    const prefs = pr.ok && pr.data && typeof pr.data === 'object' ? pr.data : {};
    const lang = req.query && req.query.lang ? normLang(req.query.lang) : normLang(prefs.lang);
    await loadMedia();
    const out = await send(forceUid, ch, lang, prefs.summary || null, prefs.tz || null);
    res.status(200).json({ ok: true, forced: true, kind: ch === CHANNELS.morning ? 'morning' : 'evening', lang, result: out });
    return;
  }

  // Расписание: оба канала за один тик (сработает лишь тот, где у пользователя сейчас нужный час).
  await loadMedia();
  const morning = await runChannel(CHANNELS.morning, 'morning');
  const evening = await runChannel(CHANNELS.evening, 'evening');
  res.status(200).json({ ok: true, morning, evening });
}
