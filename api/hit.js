// Учёт посещаемости (DAU): клиент шлёт сюда {uid, platform, tz} один раз при запуске.
// Пишем в Supabase через RPC record_visit сервисным ключом — ключ не покидает сервер.
// Заодно регистрируем пользователя бота (bot_register) с его часовым поясом — для вечерних
// напоминаний. Всегда отвечаем 200: это fire-and-forget, клиент не должен ретраить и падать.
import { supaRpc } from './_supa.js';
const TZ = process.env.STATS_TZ || 'UTC';

function localDay() {
  try {
    // en-CA даёт формат YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(200).json({ ok: false, reason: 'no-supabase-env' }); return; }

  let data = {};
  try { data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}
  const uid = data && data.uid != null ? String(data.uid).slice(0, 64) : '';
  if (!uid) { res.status(200).json({ ok: false, reason: 'no-uid' }); return; }
  const platform = data && data.platform ? String(data.platform).slice(0, 32) : null;
  const tz = data && data.tz ? String(data.tz).slice(0, 64) : null;
  // Источник перехода из start_param Mini App (?startapp=<src>); null → запишется 'direct'.
  const source = data && data.source ? String(data.source).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : null;

  // Регистрация пользователя бота с поясом + фиксация источника (best-effort, first-touch).
  await supaRpc('bot_register', { p_user_id: uid, p_tz: tz, p_push: null, p_secret: process.env.NUDGE_SECRET });
  await supaRpc('record_source', { p_user_id: uid, p_source: source, p_secret: process.env.NUDGE_SECRET });

  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/record_visit', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: uid, p_day: localDay(), p_platform: platform }),
    });
    if (!r.ok) {
      console.log('HIT supabase ' + r.status + ' ' + (await r.text()));
      res.status(200).json({ ok: false });
      return;
    }
  } catch (e) {
    console.log('HIT exception ' + (e && e.message));
    res.status(200).json({ ok: false });
    return;
  }
  res.status(200).json({ ok: true });
}
