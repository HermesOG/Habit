// Статистика использования. Ключ STATS_KEY принимается в заголовке (предпочтительно) или в
// query (для старого дашборда):
//   GET /api/stats            + заголовок x-stats-key: <ключ>  (или Authorization: Bearer <ключ>)
//   GET /api/stats?key=<ключ>                                   -> дашборд (HTML)
//   ...&format=json                                             -> сырой JSON
//   ...&days=60                                                 -> глубина графика (по умолчанию 30, максимум 365)
import crypto from 'node:crypto';

function keyOk(req) {
  const secret = process.env.STATS_KEY;
  if (!secret) return false;
  const auth = String(req.headers['authorization'] || '');
  const provided = String(req.headers['x-stats-key'] || (auth.startsWith('Bearer ') ? auth.slice(7) : '') || (req.query && req.query.key) || '');
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  // CORS: дашборд живёт на отдельном origin и читает эти данные. Доступ закрыт ключом.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-stats-key, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!keyOk(req)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(500).json({ ok: false, error: 'no-supabase-env' }); return; }

  const days = Math.min(Math.max(parseInt((req.query && req.query.days) || '30', 10) || 30, 1), 365);

  let payload;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/' + (process.env.RPC_PREFIX || '') + 'get_stats', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_days: days }),
    });
    if (!r.ok) { res.status(500).json({ ok: false, error: await r.text() }); return; }
    payload = await r.json();
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message });
    return;
  }

  const data = {
    total_users: (payload && payload.total_users) || 0,
    active_7d: (payload && payload.active_7d) || 0,
    active_30d: (payload && payload.active_30d) || 0,
    daily: (payload && payload.daily) || [],
    by_source: (payload && payload.by_source) || [],
    funnel: (payload && payload.funnel) || null,
  };

  if (req.query && (req.query.format === 'json' || req.query.json)) {
    res.status(200).json({ ok: true, ...data });
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderDashboard({ ...data, days }));
}

export function renderDashboard({ total_users, active_7d, active_30d, daily, by_source, funnel, days }) {
  const esc = (v) => String(v).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const latest = daily[0] || null;

  const tile = (label, value, sub) =>
    '<div class="tile"><div class="tl">' + esc(label) + '</div><div class="tv">' + esc(value) + '</div>'
    + (sub ? '<div class="ts">' + esc(sub) + '</div>' : '') + '</div>';

  const tiles = [
    tile('Всего пользователей', total_users, 'за всё время'),
    tile('Активны за 7 дней', active_7d, 'уникальных'),
    tile('Активны за 30 дней', active_30d, 'уникальных'),
    tile('Последний день', latest ? latest.users : 0, latest ? latest.day : '—'),
  ].join('');

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

  // Воронка первой недели: сколько людей дошло до каждого шага
  let funnelCard = '';
  if (funnel) {
    const steps = [
      ['Открыли приложение', funnel.opened],
      ['Создали привычку', funnel.habit_created],
      ['Сделали первую отметку', funnel.checked],
      ['Отметили во второй день', funnel.checked_2days],
      ['Отметили на 7-й день и позже', funnel.checked_day7],
    ];
    const max = Math.max(1, ...steps.map((s) => s[1] | 0));
    const rows = steps.map(([l, v]) => {
      const w = Math.round(((v | 0) / max) * 100);
      return '<div class="frow"><div class="fl">' + esc(l) + '</div><div class="fb"><div class="ff" style="width:' + w + '%"></div></div><div class="fv">' + esc(v | 0) + '</div></div>';
    }).join('');
    const foot = '<div class="ts" style="margin-top:10px">Отключили хотя бы один канал: ' + esc(funnel.muted_any | 0) + ' · заблокировали бота: ' + esc(funnel.blocked | 0) + '</div>';
    funnelCard = '<div class="card"><div class="ct">Воронка</div>' + rows + foot + '</div>';
  }

  let sourceCard = '';
  if (by_source && by_source.length) {
    const rows = by_source.map((s) => '<tr><td>' + esc(s.source) + '</td><td>' + esc(s.users) + '</td></tr>').join('');
    sourceCard = '<div class="card"><div class="ct">Источники перехода</div><table><thead><tr><th>Источник</th><th>Людей</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  const rows = daily.map((d) => '<tr><td>' + esc(d.day) + '</td><td>' + esc(d.users) + '</td><td>' + esc(d.visits) + '</td></tr>').join('');
  const table = daily.length
    ? '<div class="card"><table><thead><tr><th>День</th><th>Юзеров</th><th>Заходов</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '';

  return '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
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
    + '.frow{display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:center;padding:6px 0;font-size:13.5px}'
    + '.fb{height:10px;background:var(--accent-soft);border-radius:5px;overflow:hidden}.ff{height:100%;background:var(--accent);border-radius:5px}'
    + '.fv{font-variant-numeric:tabular-nums;min-width:28px;text-align:right;font-weight:600}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th,td{padding:9px 8px;border-bottom:1px solid var(--border);text-align:right;font-size:14px}'
    + 'th:first-child,td:first-child{text-align:left}'
    + 'th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.03em}'
    + 'tr:last-child td{border-bottom:none}'
    + '</style></head><body><div class="wrap">'
    + '<h1>Статистика</h1>'
    + '<p class="hint">DAU по Telegram-пользователям · показаны последние ' + esc(days) + ' дней</p>'
    + '<div class="grid">' + tiles + '</div>'
    + funnelCard + chart + sourceCard + table
    + '</div></body></html>';
}
