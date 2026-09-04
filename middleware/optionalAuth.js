import jwt from "jsonwebtoken";

/**
 * Reads a JWT from `Authorization: Bearer <token>` (preferred) or the `token`
 * cookie. If valid, sets `req.user`. Never returns 401 — routes that require
 * auth use the `authenticate` middleware in server.js instead.
 *
 * Used ahead of the download rate limiter so it can tell logged-in users
 * (exempt) from anonymous traffic (limited by IP).
 */
export const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return req.cookies?.token || null;
};

const optionalAuth = (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
            console.log("optionalAuth: user authenticated:", req.user.id);

      req.user = jwt.verify(token, process.env.JWT_SECRET);
      console.log("optionalAuth: user authenticated:", req.user.id);
    } catch {
      // ignore invalid/expired token — treat as anonymous
    }
  }
  next();
};

export default optionalAuth;
