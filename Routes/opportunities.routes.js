import express from "express";
import authenticate from "../middleware/authenticate.js";
import optionalAuth from "../middleware/optionalAuth.js";
import requireAdmin from "../middleware/requireAdmin.js";
import createUserRateLimit from "../middleware/userRateLimit.js";
import * as opp from "../controllers/opportunities.controller.js";

const router = express.Router();

// Browsing is public (optionalAuth: an admin viewer can preview a
// not-yet-published listing by slug, see getBySlug's isAdmin check).
const read = optionalAuth;
const admin = [authenticate, requireAdmin];

const submitLimit = createUserRateLimit({
  windowMinutes: 60,
  max: 10,
  message: "Too many submissions this hour — try again later.",
});
const uploadLimit = createUserRateLimit({
  windowMinutes: 60,
  max: 20,
  message: "Too many uploads — try again later.",
});

// ------------------------------------------------------------------ feed
router.get("/feed", read, opp.feed);
router.get("/feed/recommended", read, opp.recommendedFeed);
router.get("/bookmarks", authenticate, opp.bookmarksFeed);
router.get("/companies/:name/opportunities", read, opp.companyFeed);
router.get("/suggest", read, opp.suggest);

// ----------------------------------------------------------------- uploads
router.post("/uploads/presign", authenticate, uploadLimit, opp.presignUpload);

// -------------------------------------------------------- student submission
router.post("/submit", authenticate, submitLimit, opp.submit);
router.post("/:id/suggest-edit", authenticate, submitLimit, opp.suggestEdit);

// ------------------------------------------------------------------- admin
// Registered before the generic "/:slug" catch-all below — otherwise
// GET /admin (and every other bare /admin* GET route) would be swallowed by
// "/:slug" treating "admin" as a slug lookup and 404ing.
router.get("/admin", ...admin, opp.adminList);
router.get("/admin/reports", ...admin, opp.adminReports);
router.post("/admin/reports/:id/resolve", ...admin, opp.adminResolveReport);
router.get("/admin/stats", ...admin, opp.adminStats);
router.get("/admin/edit-suggestions", ...admin, opp.adminEditSuggestions);
router.post("/admin/edit-suggestions/:id/resolve", ...admin, opp.adminResolveEditSuggestion);
router.get("/admin/:id", ...admin, opp.adminGet);
router.post("/admin", ...admin, opp.adminCreate);
router.put("/admin/:id", ...admin, opp.adminUpdate);
router.delete("/admin/:id", ...admin, opp.adminDelete);
router.post("/admin/:id/duplicate", ...admin, opp.adminDuplicate);
router.post("/admin/:id/publish", ...admin, opp.adminPublish);
router.post("/admin/:id/unpublish", ...admin, opp.adminUnpublish);
router.post("/admin/:id/archive", ...admin, opp.adminArchive);
router.post("/admin/:id/reject", ...admin, opp.adminReject);
router.put("/admin/:id/status", ...admin, opp.adminSetStatus);
router.put("/admin/:id/flags", ...admin, opp.adminSetFlags);
router.post("/admin/:id/verify", ...admin, opp.adminVerify);
router.get("/admin/:id/verification-log", ...admin, opp.adminVerificationLog);

// ------------------------------------------------------------------ detail
// Generic catch-all — must stay LAST among GET routes on this router.
router.get("/:slug", read, opp.getOpportunity);
router.post("/:id/view", opp.trackView);
router.post("/:id/click-apply", opp.trackApplyClick);

export default router;
