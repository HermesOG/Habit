// Проверка подписи Telegram initData — единственный способ узнать, КТО на самом деле шлёт
// запрос. Раньше /api/hit и /api/act брали uid из тела запроса и верили на слово: любой мог
// отметить действие за другого, погасить чужое напоминание или засорить статистику.
//
// Алгоритм из документации Telegram (Validating data received via the Mini App):
//   secret = HMAC_SHA256(key = "WebAppData", msg = bot_token)
//   hash   = HMAC_SHA256(key = secret, msg = "k1=v1\nk2=v2..." (все поля кроме hash, отсортированы))
import crypto from 'node:crypto';

const MAX_AGE_SEC = 2 * 24 * 3600; // initData выдаётся при открытии; приложение живёт открытым недолго

export function verifyInitData(raw, token, maxAgeSec) {
  if (!raw || !token) return null;
  let p;
  try { p = new URLSearchParams(String(raw)); } catch (e) { return null; }
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const pairs = [];
  for (const [k, v] of p.entries()) pairs.push(k + '=' + v);
  pairs.sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const a = Buffer.from(calc), b = Buffer.from(String(hash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = parseInt(p.get('auth_date') || '0', 10) || 0;
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!authDate || age > (maxAgeSec || MAX_AGE_SEC) || age < -300) return null;
  let user = null;
  try { user = JSON.parse(p.get('user') || 'null'); } catch (e) { user = null; }
  if (!user || user.id == null) return null;
  return { user, uid: String(user.id), startParam: p.get('start_param') || null, authDate };
}

export function readBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return {}; }
}

// Общий вход для эндпоинтов приложения: только POST и только с валидной подписью.
// Возвращает {body, auth} либо null — ответ в этом случае уже отправлен.
export function requireAuth(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method' }); return null; }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('AUTH_MISCONFIG нет TELEGRAM_BOT_TOKEN — подпись initData проверить нельзя');
    res.status(500).json({ ok: false, reason: 'no-bot-token' });
    return null;
  }
  const body = readBody(req);
  const auth = verifyInitData(body && body.initData, token);
  if (!auth) { res.status(401).json({ ok: false, reason: 'bad-initdata' }); return null; }
  return { body, auth };
}

export function safeStr(v, n) { return v == null || v === '' ? null : String(v).slice(0, n || 64); }
export function clean(v, n) { return String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, n || 64); }
export function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
