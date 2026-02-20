import jwksRsa from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import { PermissionContext } from '../permissions/context.js';

const jwksClientCache = {};

function getClient(jwksUri) {
  if (!jwksClientCache[jwksUri]) {
    jwksClientCache[jwksUri] = jwksRsa({ jwksUri, cache: true, rateLimit: true });
  }
  return jwksClientCache[jwksUri];
}

export function jwtAuth(options = {}) {
  const { jwksUri = process.env.JWKS_URI } = options;

  return async function authMiddleware(req, res, next) {
    if (process.env.NO_AUTH === '1') return next();

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });

    const token = auth.slice(7);
    try {
      if (!jwksUri) {
        // fallback to simple verification with secret if JWKS not configured
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        req.user = payload;
        PermissionContext.current.role = payload.role || 'user';
        return next();
      }

      const client = getClient(jwksUri);
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || !decoded.header || !decoded.header.kid) throw new Error('invalid token');

      const key = await client.getSigningKeyAsync(decoded.header.kid);
      const pub = key.getPublicKey ? key.getPublicKey() : key.rsaPublicKey;
      const payload = jwt.verify(token, pub, { algorithms: ['RS256', 'RS384', 'RS512'] });
      req.user = payload;
      PermissionContext.current.role = payload.role || 'user';
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'invalid token', details: String(e) });
    }
  };
}
