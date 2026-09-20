import express from "express";
import authenticate from "../middleware/authenticate.js";
import optionalAuth from "../middleware/optionalAuth.js";
import requireForumProfile from "../middleware/requireForumProfile.js";
import createUserRateLimit from "../middleware/userRateLimit.js";
import * as forum from "../controllers/forum.controller.js";

const router = express.Router();

// Reads are public (optionalAuth) so shared links work logged out; the viewer,
// when known, gets their own vote/role/saved state. Writes need a forum profile.
const read = optionalAuth;
const member = [authenticate, requireForumProfile];

// Anti-hammering only: this counts failed attempts too (e.g. names already
// taken). The real 1-per-day / 5-owned rule is enforced in the service.
const communityCreateLimit = createUserRateLimit({
  windowMinutes: 24 * 60,
  max: 20,
  message: "Too many community attempts today — try again tomorrow.",
});
const postLimit = createUserRateLimit({
  windowMinutes: 10,
  max: 5,
  message: "You're posting too fast — wait a few minutes.",
  skipFailedRequests: true,
});
const voteLimit = createUserRateLimit({
  windowMinutes: 1,
  max: 120,
  message: "You're voting too fast.",
});
const uploadLimit = createUserRateLimit({
  windowMinutes: 60,
  max: 20,
  message: "Too many image uploads — try again later.",
});
const commentLimit = createUserRateLimit({
  windowMinutes: 10,
  max: 30,
  message: "You're commenting too fast — wait a few minutes.",
  skipFailedRequests: true,
});
// Search hits Postgres full-text; keyed per user, or per IP when logged out —
// generous because a whole hostel can share one campus Wi-Fi IP.
const searchLimit = createUserRateLimit({
  windowMinutes: 1,
  max: 120,
  message: "Too many searches — slow down a little.",
});
const reportLimit = createUserRateLimit({
  windowMinutes: 60,
  max: 20,
  message: "Too many reports — try again later.",
});
const handleCheckLimit = createUserRateLimit({
  windowMinutes: 1,
  max: 30,
  message: "Slow down a little.",
});

// ---------------------------------------------------------------- profile
router.get("/me", authenticate, forum.getMe);
router.post("/me", authenticate, forum.claimHandle);
router.patch("/me", member, forum.updateMe);
router.get("/handles/available", authenticate, handleCheckLimit, forum.handleAvailable);
router.get("/me/blocks", member, forum.listBlocks);
router.delete("/me/blocks/ref/:ref", member, forum.unblockViaRef);
router.get("/users/:handle", read, forum.getUser);
router.post("/users/:handle/block", member, forum.blockUser);
router.delete("/users/:handle/block", member, forum.unblockUser);

// ------------------------------------------------------------ communities
router.get("/communities", read, forum.listCommunities);
router.get("/communities/mine", member, forum.listMyCommunities);
router.post("/communities", member, communityCreateLimit, forum.createCommunity);
router.get("/communities/:name", read, forum.getCommunity);
router.patch("/communities/:name", member, forum.updateCommunity);
router.post("/communities/:name/join", member, forum.joinCommunity);
router.delete("/communities/:name/join", member, forum.leaveCommunity);
router.get("/communities/:name/moderators", read, forum.listModerators);
router.post("/communities/:name/moderators", member, forum.addModerator);
router.delete("/communities/:name/moderators/:handle", member, forum.removeModerator);
router.get("/communities/:name/bans", member, forum.listBans);
router.post("/communities/:name/bans", member, forum.banUser);
router.delete("/communities/:name/bans/ref/:ref", member, forum.unbanViaRef);
router.delete("/communities/:name/bans/:handle", member, forum.unbanUser);

// ------------------------------------------------------------------ feeds
router.get("/feed/home", read, forum.homeFeed);
router.get("/feed/popular", read, forum.popularFeed);
router.get("/communities/:name/posts", read, forum.communityFeed);
router.get("/users/:handle/posts", read, forum.userPosts);
router.get("/me/saved", member, forum.savedPosts);

// ------------------------------------------------------------------ posts
router.post("/uploads/image-url", member, uploadLimit, forum.imageUploadUrl);
router.post("/posts", member, postLimit, forum.createPost);
router.get("/posts/:id", read, forum.getPost);
router.patch("/posts/:id", member, forum.editPost);
router.delete("/posts/:id", member, forum.deletePost);
router.post("/posts/:id/vote", member, voteLimit, forum.votePost);
router.post("/posts/:id/save", member, forum.savePost);
router.delete("/posts/:id/save", member, forum.unsavePost);
router.post("/posts/:id/hide", member, forum.hidePost);
router.delete("/posts/:id/hide", member, forum.unhidePost);
router.post("/posts/:id/block-author", member, forum.blockPostAuthor);

// --------------------------------------------------------------- comments
router.get("/posts/:id/comments", read, forum.listComments);
router.post("/posts/:id/comments", member, commentLimit, forum.createComment);
router.get("/comments/:id/replies", read, forum.listReplies);
router.patch("/comments/:id", member, forum.editComment);
router.delete("/comments/:id", member, forum.deleteComment);
router.post("/comments/:id/vote", member, voteLimit, forum.voteComment);
router.post("/comments/:id/block-author", member, forum.blockCommentAuthor);
router.get("/users/:handle/comments", read, forum.userComments);

// ----------------------------------------------------------------- search
router.get("/search", read, searchLimit, forum.search);
router.get("/search/suggest", read, searchLimit, forum.suggest);

// ------------------------------------------------------------- moderation
router.post("/posts/:id/report", member, reportLimit, forum.reportPost);
router.post("/comments/:id/report", member, reportLimit, forum.reportComment);
router.post("/posts/:id/remove", member, forum.removePost);
router.post("/posts/:id/approve", member, forum.approvePost);
router.post("/posts/:id/pin", member, forum.pinPost);
router.post("/posts/:id/unpin", member, forum.unpinPost);
router.post("/posts/:id/lock", member, forum.lockPost);
router.post("/posts/:id/unlock", member, forum.unlockPost);
router.post("/posts/:id/ban-author", member, forum.banPostAuthor);
router.post("/comments/:id/remove", member, forum.removeComment);
router.post("/comments/:id/approve", member, forum.approveComment);
router.post("/comments/:id/ban-author", member, forum.banCommentAuthor);
router.get("/communities/:name/modqueue", member, forum.modQueue);
router.get("/communities/:name/modlog", member, forum.modLog);
router.post("/reports/:reportId/resolve", member, forum.resolveReport);
router.post("/reports/:reportId/dismiss", member, forum.dismissReport);

// ------------------------------------------------------------- site admin
router.get("/admin/reports", member, forum.adminQueue);
router.post("/admin/anon-author/:type/:id", member, forum.revealAnonymousAuthor);
router.post("/admin/users/:handle/ban", member, forum.siteBan);
router.delete("/admin/users/:handle/ban", member, forum.siteUnban);
router.post("/admin/communities/:name/remove", member, forum.removeCommunity);

// ------------------------------------------------------------------ share
// Open Graph HTML for link-preview bots (see services/forum/share.service.js).
router.get("/share/posts/:id", forum.sharePreview);

export default router;
