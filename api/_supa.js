// Общий вызов Supabase RPC сервисным ключом (ключ не покидает сервер).
// Файл с префиксом «_» Vercel не считает роутом — только импортируемый модуль.
// Ключ: сервисный, если задан, иначе публичный anon (функции bot_* защищены секретом внутри,
// см. миграцию bot_nudge_secret_gate — anon-ключ бесполезен без NUDGE_SECRET).
export async function supaRpc(fn, args) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, status: 0, data: null, reason: 'no-supabase-env' };
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args || {}),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) console.log('SUPA_ERR ' + fn + ' ' + r.status + ' ' + JSON.stringify(data));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    console.log('SUPA_EXC ' + fn + ' ' + (e && e.message));
    return { ok: false, status: 0, data: null, reason: e && e.message };
  }
}
