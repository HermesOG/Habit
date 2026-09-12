// Заход в приложение: один вызов при запуске. Что делает:
//   • регистрирует пользователя бота с его часовым поясом (для напоминаний);
//   • фиксирует источник перехода (first-touch) из start_param, в т.ч. реферала ref_<id>;
//   • пишет визит в dau и событие open (воронка);
//   • отдаёт приложению конфиг (имя бота для ссылок) и накопленный бонус за друзей.
// Личность берётся ТОЛЬКО из подписанного initData (см. _auth.js). Ошибки конфигурации
// отдаём как 500, чтобы их было видно в логах и Runtime Errors Vercel, а не молча.
import { supaRpc } from './_supa.js';
import { requireAuth, safeStr, clean } from './_auth.js';
import { tg, localDay } from './_tg.js';
import { t, normLang } from './_i18n.js';

const REF = /^ref_(\d{3,20})$/;

export default async function handler(req, res) {
  const a = requireAuth(req, res);
  if (!a) return;
  const { body, auth } = a;
  const uid = auth.uid;
  const S = process.env.NUDGE_SECRET;
  const platform = safeStr(body.platform, 32);
  const tz = safeStr(body.tz, 64);
  const sp = clean(auth.startParam, 64);
  const ref = REF.exec(sp);
  const source = ref ? 'referral' : (sp || null);
  const day = localDay(tz || process.env.STATS_TZ || 'UTC');
  res.setHeader('Cache-Control', 'no-store');

  const reg = await supaRpc('bot_register', { p_user_id: uid, p_tz: tz, p_push: null, p_secret: S });
  if (!reg.ok && reg.reason === 'no-supabase-env') { res.status(500).json({ ok: false, reason: 'no-supabase-env' }); return; }
  await supaRpc('record_source', { p_user_id: uid, p_source: source, p_secret: S });

  // Реферал: и новичку, и пригласившему начисляется бонус (см. миграцию 0005).
  if (ref && ref[1] !== uid) {
    const r = await supaRpc('record_referral', { p_user_id: uid, p_referrer: ref[1], p_secret: S });
    const d = r.ok && r.data && typeof r.data === 'object' ? r.data : null;
    if (d && d.is_new) {
      const lr = await supaRpc('bot_get_lang', { p_user_id: ref[1], p_secret: S });
      tg('sendMessage', { chat_id: ref[1], text: t(normLang(lr && lr.data), 'refJoined', { n: d.bonus }) });
    }
  }

  const [visit, , bonus] = await Promise.all([
    supaRpc('record_visit', { p_user_id: uid, p_day: day, p_platform: platform }),
    supaRpc('record_event', { p_user_id: uid, p_name: 'open', p_day: day, p_meta: platform ? { platform } : null, p_secret: S }),
    supaRpc('bot_claim_bonus', { p_user_id: uid, p_secret: S }),
  ]);
  if (!visit.ok) console.log('HIT record_visit ' + visit.status + ' ' + JSON.stringify(visit.data));

  res.status(200).json({
    ok: visit.ok,
    bot: process.env.BOT_USERNAME || null,
    support: process.env.SUPPORT_URL || null,
    channel: process.env.CHANNEL_URL || null,
    bonus: bonus.ok && typeof bonus.data === 'number' ? bonus.data : 0,
  });
}
