// Временная диагностика мобильного layout: приложение шлёт сюда замеры
// (insets/высоты/геометрия), они попадают в runtime-логи Vercel. Удалить после отладки.
export default async function handler(req, res) {
  let body = '';
  try {
    if (typeof req.body === 'string') body = req.body;
    else if (req.body) body = JSON.stringify(req.body);
  } catch (e) { body = 'unparseable'; }
  console.log('DIAG ' + body);
  res.status(200).json({ ok: true });
}
