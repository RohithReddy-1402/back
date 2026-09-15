/**
 * Requires `authenticate` to have run first (needs req.user). Generalizes the
 * inline `role !== 'admin'` check duplicated in server.js.
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

export default requireAdmin;
