// Пинг «сегодня был шаг»: приложение шлёт сюда {uid, tz} при любом начислении XP.
// Отмечаем last_action_day по локальному поясу — тогда вечернее напоминание не придёт.
// Fire-and-forget, всегда 200: клиент не должен ретраить и падать.
import { supaRpc } from './_supa.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  let d = {};
  try { d = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}
  const uid = d && d.uid != null ? String(d.uid).slice(0, 64) : '';
  const tz = d && d.tz ? String(d.tz).slice(0, 64) : null;
  if (!uid) { res.status(200).json({ ok: false, reason: 'no-uid' }); return; }
  await supaRpc('bot_mark_action', { p_user_id: uid, p_tz: tz, p_secret: process.env.NUDGE_SECRET });
  res.status(200).json({ ok: true });
}
