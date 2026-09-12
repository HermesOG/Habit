// Общие помощники для Bot API. Раньше tg() дублировался в bot.js и nudge.js.
export async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.log('TG_MISCONFIG нет TELEGRAM_BOT_TOKEN'); return { ok: false, description: 'no-token' }; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!data.ok) console.log('TG_ERR ' + method + ' ' + JSON.stringify(data));
    return data;
  } catch (e) {
    console.log('TG_EXC ' + method + ' ' + (e && e.message));
    return { ok: false, description: e && e.message };
  }
}

// Классификация неудачной отправки: «человек недоступен навсегда» (заблокировал бота,
// удалил аккаунт) — таких больше не дёргаем; всё остальное — временный сбой, повторим.
export function tgFailKind(data) {
  const code = data && data.error_code;
  const d = String((data && data.description) || '');
  if (code === 403) return 'blocked';
  if (code === 400 && /chat not found|user not found|PEER_ID_INVALID|user is deactivated/i.test(d)) return 'blocked';
  return 'other';
}

// Календарный день в поясе пользователя (en-CA даёт YYYY-MM-DD).
export function localDay(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

// День недели в поясе пользователя в нумерации приложения: 0 = Пн … 6 = Вс.
export function localDow(tz) {
  try {
    const w = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', weekday: 'short' }).format(new Date());
    return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[w] ?? 0;
  } catch (e) { return 0; }
}
