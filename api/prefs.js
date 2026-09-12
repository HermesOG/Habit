// Настройки напоминаний из экрана «Уведомления» приложения.
//   {initData, get:true}                                   → {ok, prefs}
//   {initData, set:{morning, evening, morning_hour, evening_hour}} → {ok, prefs}
// Те же поля переключают кнопки бота («Не будить по утрам» / «Не напоминать») и /stop —
// источник истины один: bot_users.
import { supaRpc } from './_supa.js';
import { requireAuth, clampInt } from './_auth.js';

export default async function handler(req, res) {
  const a = requireAuth(req, res);
  if (!a) return;
  const { body, auth } = a;
  const S = process.env.NUDGE_SECRET;
  res.setHeader('Cache-Control', 'no-store');

  if (body.set && typeof body.set === 'object') {
    const s = body.set;
    const r = await supaRpc('bot_set_prefs', {
      p_user_id: auth.uid,
      p_morning: typeof s.morning === 'boolean' ? s.morning : null,
      p_evening: typeof s.evening === 'boolean' ? s.evening : null,
      p_morning_hour: s.morning_hour == null ? null : clampInt(s.morning_hour, 5, 12, 9),
      p_evening_hour: s.evening_hour == null ? null : clampInt(s.evening_hour, 17, 23, 20),
      p_secret: S,
    });
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, prefs: r.ok ? r.data : null });
    return;
  }
  const r = await supaRpc('bot_get_prefs', { p_user_id: auth.uid, p_secret: S });
  res.status(r.ok ? 200 : 500).json({ ok: r.ok, prefs: r.ok ? r.data : null });
}
