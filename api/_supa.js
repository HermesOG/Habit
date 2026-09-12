// Общий вызов Supabase RPC. Только сервисный ключ: после миграции 0002 функции bot_* больше
// не исполняются от anon, поэтому отсутствие ключа — ошибка конфигурации, а не «тихий режим».
// Файл с префиксом «_» Vercel не считает роутом — только импортируемый модуль.
//
// RPC_PREFIX — для тестового стенда: в той же базе живёт схема `staging`, а её функции лежат
// в public с префиксом `stg_` (см. db/README.md). Прод: переменная не задана.
export async function supaRpc(fn, args) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('SUPA_MISCONFIG ' + fn + ': нет SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    return { ok: false, status: 0, data: null, reason: 'no-supabase-env' };
  }
  const name = (process.env.RPC_PREFIX || '') + fn;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args || {}),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) console.log('SUPA_ERR ' + name + ' ' + r.status + ' ' + JSON.stringify(data));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    console.log('SUPA_EXC ' + name + ' ' + (e && e.message));
    return { ok: false, status: 0, data: null, reason: e && e.message };
  }
}
