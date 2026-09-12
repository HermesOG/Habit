// Продуктовые события для воронки: {initData, name, meta?, tz?}.
// Одно событие на пользователя в день (PK user_id+name+day) — считаем людей, а не тапы.
import { supaRpc } from './_supa.js';
import { requireAuth, safeStr } from './_auth.js';
import { localDay } from './_tg.js';

export const EVENTS = [
  'open', 'check', 'habit_created', 'task_created', 'goal_created', 'level_up',
  'share_opened', 'share_sent', 'prefs_changed', 'lang_picked', 'bonus_claimed', 'first_habit',
  'onb_1', 'onb_2', 'onb_3', 'onb_done', 'onb_skip', 'first_check_same_session',
];

export default async function handler(req, res) {
  const a = requireAuth(req, res);
  if (!a) return;
  const { body, auth } = a;
  const name = String(body.name || '');
  if (EVENTS.indexOf(name) < 0) { res.status(400).json({ ok: false, reason: 'unknown-event' }); return; }
  let meta = null;
  if (body.meta && typeof body.meta === 'object') {
    meta = {};
    for (const k of Object.keys(body.meta).slice(0, 8)) {
      const v = body.meta[k];
      if (typeof v === 'number' || typeof v === 'boolean') meta[k] = v;
      else if (typeof v === 'string') meta[k] = v.slice(0, 64);
    }
  }
  const r = await supaRpc('record_event', {
    p_user_id: auth.uid, p_name: name, p_day: localDay(safeStr(body.tz, 64)), p_meta: meta, p_secret: process.env.NUDGE_SECRET,
  });
  // Приложение начислило бонус за друга — списываем его с ожидающих (см. миграцию 0005).
  if (name === 'bonus_claimed' && meta && typeof meta.n === 'number' && meta.n > 0) {
    await supaRpc('bot_ack_bonus', { p_user_id: auth.uid, p_n: Math.round(meta.n), p_secret: process.env.NUDGE_SECRET });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(r.ok ? 200 : 500).json({ ok: r.ok });
}
