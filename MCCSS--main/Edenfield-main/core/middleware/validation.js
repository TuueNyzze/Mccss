export function validateTaskPayload(req, res, next) {
  const body = req.body || {};
  const { id, intervalMs } = body;
  if (!id || typeof id !== 'string' || id.length > 128) return res.status(400).json({ error: 'invalid id' });
  const n = Number(intervalMs);
  if (!Number.isFinite(n) || n < 500) return res.status(400).json({ error: 'invalid intervalMs (>=500)' });
  return next();
}
