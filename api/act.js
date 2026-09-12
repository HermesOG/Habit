// Пинг «сегодня был шаг» + сводка состояния для адресных напоминаний.
//   {initData, tz, summary}              — отметить действие дня и обновить сводку
//   {initData, tz, summary, mark:false}  — только обновить сводку (изменился список привычек)
// Сводка — это не данные пользователя целиком, а минимум для текста напоминания:
// названия привычек, серии, сделано ли сегодня, расписание, число задач на день.
import { supaRpc } from './_supa.js';
import { requireAuth, safeStr, clampInt } from './_auth.js';
import { localDay } from './_tg.js';

const SCHED = ['daily', 'days', 'count'];

export function compactSummary(s) {
  if (!s || typeof s !== 'object') return null;
  const habits = Array.isArray(s.h) ? s.h.slice(0, 30).map((h) => ({
    n: (safeStr(h && h.n, 40) || '').trim(),
    s: clampInt(h && h.s, 0, 99999, 0),
    d: !!(h && h.d),
    sch: SCHED.indexOf(h && h.sch) >= 0 ? h.sch : 'daily',
    days: Array.isArray(h && h.days) ? h.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6).slice(0, 7) : [],
  })).filter((h) => h.n) : [];
  return { v: 1, lvl: clampInt(s.lvl, 1, 500, 1), t: clampInt(s.t, 0, 999, 0), h: habits };
}

export default async function handler(req, res) {
  const a = requireAuth(req, res);
  if (!a) return;
  const { body, auth } = a;
  const S = process.env.NUDGE_SECRET;
  const tz = safeStr(body.tz, 64);
  const summary = compactSummary(body.summary);
  res.setHeader('Cache-Control', 'no-store');

  if (body.mark === false) {
    const r = await supaRpc('bot_sync', { p_user_id: auth.uid, p_tz: tz, p_summary: summary, p_secret: S });
    res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    return;
  }
  const [m] = await Promise.all([
    supaRpc('bot_mark_action', { p_user_id: auth.uid, p_tz: tz, p_summary: summary, p_secret: S }),
    supaRpc('record_event', { p_user_id: auth.uid, p_name: 'check', p_day: localDay(tz), p_meta: null, p_secret: S }),
  ]);
  res.status(m.ok ? 200 : 500).json({ ok: m.ok });
}
