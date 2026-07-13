// Просмотр статистики посещаемости. Защищено секретом (env STATS_KEY):
//   /api/stats?key=ТВОЙ_СЕКРЕТ            -> дашборд (HTML)
//   /api/stats?key=ТВОЙ_СЕКРЕТ&format=json -> сырой JSON
//   &days=60                              -> глубина графика/таблицы (по умолчанию 30, максимум 365)
export default async function handler(req, res) {
  // CORS: дашборд живёт на отдельном origin (свой Vercel-проект) и читает эти данные.
  // Доступ всё равно закрыт секретом STATS_KEY, поэтому Allow-Origin: * безопасен.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

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
  const a7 = (payload && payload.active_7d) || 0;
  const a30 = (payload && payload.active_30d) || 0;

  // ?format=json — сырые данные
  if (req.query && (req.query.format === 'json' || req.query.json)) {
    res.status(200).json({ ok: true, total_users: total, active_7d: a7, active_30d: a30, daily });
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderDashboard({ total, a7, a30, daily, days }));
}

export function renderDashboard({ total, a7, a30, daily, days }) {
  const esc = (v) => String(v).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const latest = daily[0] || null;

  const tile = (label, value, sub) =>
    '<div class="tile"><div class="tl">' + esc(label) + '</div><div class="tv">' + esc(value) + '</div>'
    + (sub ? '<div class="ts">' + esc(sub) + '</div>' : '') + '</div>';

  const tiles = [
    tile('Всего пользователей', total, 'за всё время'),
    tile('Активны за 7 дней', a7, 'уникальных'),
    tile('Активны за 30 дней', a30, 'уникальных'),
    tile('Последний день', latest ? latest.users : 0, latest ? latest.day : '—'),
  ].join('');

  // График: столбики по дням в хронологическом порядке (старые слева)
  let chart;
  if (daily.length) {
    const chron = daily.slice().reverse();
    const maxU = Math.max(1, ...chron.map((d) => d.users));
    const bars = chron.map((d) => {
      const h = Math.max(3, Math.round((d.users / maxU) * 100));
      return '<div class="bar" style="height:' + h + '%" title="' + esc(d.day + ': ' + d.users + ' юзеров, ' + d.visits + ' заходов') + '"></div>';
    }).join('');
    const axis = '<div class="axis"><span>' + esc(chron[0].day) + '</span><span>' + esc(chron[chron.length - 1].day) + '</span></div>';
    chart = '<div class="card"><div class="ct">Уникальные пользователи по дням</div><div class="chart">' + bars + '</div>' + axis + '</div>';
  } else {
    chart = '<div class="card empty">Пока нет данных. Как только кто-то откроет приложение — появятся цифры.</div>';
  }

  const rows = daily.map((d) =>
    '<tr><td>' + esc(d.day) + '</td><td>' + esc(d.users) + '</td><td>' + esc(d.visits) + '</td></tr>'
  ).join('');
  const table = daily.length
    ? '<div class="card"><table><thead><tr><th>День</th><th>Юзеров</th><th>Заходов</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '';

  return '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Статистика · Хранитель</title><style>'
    + ':root{--bg:#f6f6f7;--card:#fff;--text:#111;--muted:#8a8a90;--border:#ececee;--accent:#6366f1;--accent-soft:#eeeefb}'
    + '@media(prefers-color-scheme:dark){:root{--bg:#0e0e10;--card:#18181b;--text:#ededed;--muted:#8a8a90;--border:#262629;--accent:#818cf8;--accent-soft:#1e1e2e}}'
    + '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}'
    + '.wrap{max-width:720px;margin:0 auto;padding:28px 18px 48px}'
    + 'h1{font-size:20px;font-weight:700;margin:0 0 2px}.hint{color:var(--muted);font-size:13px;margin:0 0 22px}'
    + '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px}'
    + '@media(min-width:560px){.grid{grid-template-columns:repeat(4,1fr)}}'
    + '.tile{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px}'
    + '.tl{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:600}'
    + '.tv{font-size:30px;font-weight:700;line-height:1.15;margin-top:6px}'
    + '.ts{color:var(--muted);font-size:12px;margin-top:2px}'
    + '.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:12px}'
    + '.ct{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:14px}'
    + '.chart{display:flex;align-items:flex-end;gap:3px;height:170px}'
    + '.bar{flex:1 1 0;min-width:2px;background:var(--accent);border-radius:4px 4px 0 0;transition:opacity .15s}'
    + '.bar:hover{opacity:.7}'
    + '.axis{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin-top:8px}'
    + '.empty{color:var(--muted);text-align:center;padding:32px 16px}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th,td{padding:9px 8px;border-bottom:1px solid var(--border);text-align:right;font-size:14px}'
    + 'th:first-child,td:first-child{text-align:left}'
    + 'th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.03em}'
    + 'tr:last-child td{border-bottom:none}'
    + '</style></head><body><div class="wrap">'
    + '<h1>Статистика посещаемости</h1>'
    + '<p class="hint">DAU по Telegram-пользователям · показаны последние ' + esc(days) + ' дней</p>'
    + '<div class="grid">' + tiles + '</div>'
    + chart
    + table
    + '</div></body></html>';
}
