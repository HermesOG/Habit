// Просмотр статистики посещаемости. Защищено секретом (env STATS_KEY):
//   /api/stats?key=ТВОЙ_СЕКРЕТ            -> JSON
//   /api/stats?key=ТВОЙ_СЕКРЕТ&html=1     -> простая таблица в браузере
//   &days=60                              -> глубина (по умолчанию 30, максимум 365)
export default async function handler(req, res) {
  const secret = process.env.STATS_KEY;
  const provided = (req.query && req.query.key) || '';
  if (!secret || provided !== secret) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(500).json({ ok: false, error: 'no-supabase-env' }); return; }

  const days = Math.min(Math.max(parseInt((req.query && req.query.days) || '30', 10) || 30, 1), 365);

  let payload;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/get_stats', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_days: days }),
    });
    if (!r.ok) { res.status(500).json({ ok: false, error: await r.text() }); return; }
    payload = await r.json();
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message });
    return;
  }

  const daily = (payload && payload.daily) || [];
  const total = (payload && payload.total_users) || 0;

  if (req.query && req.query.html) {
    const esc = (v) => String(v).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const rows = daily.map((d) => `<tr><td>${esc(d.day)}</td><td>${esc(d.users)}</td><td>${esc(d.visits)}</td></tr>`).join('');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Статистика</title>'
      + '<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;color:#111}'
      + 'h1{font-size:14px;color:#888;font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}'
      + '.big{font-size:34px;font-weight:700;margin-bottom:8px}'
      + 'table{width:100%;border-collapse:collapse;margin-top:20px}'
      + 'th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:right}'
      + 'th:first-child,td:first-child{text-align:left}'
      + 'th{color:#888;font-weight:500;font-size:11px;text-transform:uppercase}'
      + '@media(prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#2a2a2a}}</style>'
      + '<h1>Всего уникальных пользователей</h1><div class=big>' + esc(total) + '</div>'
      + '<table><tr><th>День</th><th>Юзеров</th><th>Заходов</th></tr>' + rows + '</table>');
    return;
  }

  res.status(200).json({ ok: true, total_users: total, daily });
}
