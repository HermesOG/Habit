// «Поделиться Хранителем»: готовим inline-сообщение (карточка формы + подпись + кнопка
// с реферальной ссылкой), приложение показывает его через WebApp.shareMessage(id).
// Если Bot API отказал (старый клиент, нет прав) — отдаём ссылку и текст для запасного
// пути через t.me/share/url.
//   {initData, level, streak, theme, form, lang} → {ok, id, link, text}
import { requireAuth, clampInt } from './_auth.js';
import { tg } from './_tg.js';
import { t, normLang } from './_i18n.js';

const THEMES = ['amber', 'azure', 'spark'];

export default async function handler(req, res) {
  const a = requireAuth(req, res);
  if (!a) return;
  const { body, auth } = a;
  const bot = process.env.BOT_USERNAME;
  const base = String(process.env.WEBAPP_URL || '').replace(/\/$/, '');
  res.setHeader('Cache-Control', 'no-store');
  if (!bot || !base) { res.status(500).json({ ok: false, reason: 'no-bot-username-or-webapp-url' }); return; }

  const lvl = clampInt(body.level, 1, 500, 1);
  const streak = clampInt(body.streak, 0, 99999, 0);
  const theme = THEMES.indexOf(body.theme) >= 0 ? body.theme : 'amber';
  const form = clampInt(body.form, 1, 5, 1);
  const lang = normLang(body.lang);

  const link = `https://t.me/${bot}?start=ref_${auth.uid}`;
  const text = t(lang, 'shareCaption', { lvl, streak });
  const photo = `${base}/uploads/share_form${form}_${theme}.jpg`;

  const r = await tg('savePreparedInlineMessage', {
    user_id: Number(auth.uid),
    result: {
      type: 'photo', id: 'g' + Date.now(),
      photo_url: photo, thumbnail_url: photo,
      caption: text,
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'shareBtn'), url: link }]] },
    },
    allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true,
  });
  if (r.ok && r.result && r.result.id) res.status(200).json({ ok: true, id: r.result.id, link, text });
  else res.status(200).json({ ok: false, link, text, reason: (r && r.description) || 'tg-failed' });
}
