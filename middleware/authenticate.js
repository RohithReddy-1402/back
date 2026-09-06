import jwt from "jsonwebtoken";
import { extractToken } from "./optionalAuth.js";

/**
 * Requires a valid JWT (Authorization: Bearer <jwt>, or the `token` cookie as a
 * fallback). Sets `req.user` from the decoded payload or responds 401.
 */
const authenticate = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    console.error("JWT VERIFY ERROR:", error.name, error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export default authenticate;
