import * as profiles from "../services/forum/profile.service.js";
import * as communities from "../services/forum/community.service.js";
import * as feeds from "../services/forum/feed.service.js";
import * as posts from "../services/forum/post.service.js";
import * as votes from "../services/forum/vote.service.js";
import * as uploads from "../services/forum/upload.service.js";
import * as comments from "../services/forum/comment.service.js";
import * as searchService from "../services/forum/search.service.js";
import * as moderation from "../services/forum/moderation.service.js";
import { postPreviewHtml } from "../services/forum/share.service.js";
import { respondWithError } from "../services/httpError.js";

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    respondWithError(res, error, "Forum error");
  }
};

/** Who is acting: forum profile id plus site-admin flag (from the JWT role). */
const actorOf = (req) => ({ userId: req.forumUser.user_id, isAdmin: req.user?.role === "admin" });
const viewerOf = (req) => req.user?.id || null;

// ---------------------------------------------------------------- profile

export const getMe = wrap(async (req, res) => {
  res.status(200).json(await profiles.getMe(req.user.id));
});

export const claimHandle = wrap(async (req, res) => {
  res.status(201).json(await profiles.claimHandle(req.user.id, req.body));
});

export const updateMe = wrap(async (req, res) => {
  res.status(200).json(await profiles.updateMe(req.user.id, req.body));
});

export const handleAvailable = wrap(async (req, res) => {
  res.status(200).json(await profiles.isHandleAvailable(req.query.h));
});

export const getUser = wrap(async (req, res) => {
  res.status(200).json(await profiles.getPublicProfile(req.params.handle, viewerOf(req)));
});

export const listBlocks = wrap(async (req, res) => {
  res.status(200).json(await profiles.listBlocks(req.forumUser.user_id));
});

export const blockUser = wrap(async (req, res) => {
  await profiles.blockHandle(req.forumUser.user_id, req.params.handle);
  res.status(204).send();
});

export const unblockUser = wrap(async (req, res) => {
  await profiles.unblockHandle(req.forumUser.user_id, req.params.handle);
  res.status(204).send();
});

export const unblockViaRef = wrap(async (req, res) => {
  await profiles.unblockViaRef(req.forumUser.user_id, req.params.ref);
  res.status(204).send();
});

// ------------------------------------------------------------ communities

export const listCommunities = wrap(async (req, res) => {
  res.status(200).json(await communities.listCommunities(viewerOf(req), req.query));
});

export const listMyCommunities = wrap(async (req, res) => {
  res.status(200).json(await communities.listMyCommunities(req.forumUser.user_id));
});

export const getCommunity = wrap(async (req, res) => {
  res.status(200).json(await communities.getCommunity(req.params.name, viewerOf(req)));
});

export const createCommunity = wrap(async (req, res) => {
  res.status(201).json(await communities.createCommunity(actorOf(req), req.body));
});

export const updateCommunity = wrap(async (req, res) => {
  res.status(200).json(await communities.updateCommunity(req.params.name, actorOf(req), req.body));
});

export const joinCommunity = wrap(async (req, res) => {
  res.status(200).json(await communities.joinCommunity(req.params.name, req.forumUser.user_id));
});

export const leaveCommunity = wrap(async (req, res) => {
  res.status(200).json(await communities.leaveCommunity(req.params.name, req.forumUser.user_id));
});

export const listModerators = wrap(async (req, res) => {
  res.status(200).json(await communities.listModerators(req.params.name));
});

export const addModerator = wrap(async (req, res) => {
  res.status(201).json(await communities.addModerator(req.params.name, actorOf(req), req.body?.handle));
});

export const removeModerator = wrap(async (req, res) => {
  await communities.removeModerator(req.params.name, actorOf(req), req.params.handle);
  res.status(204).send();
});

export const listBans = wrap(async (req, res) => {
  res.status(200).json(await communities.listBans(req.params.name, actorOf(req)));
});

export const banUser = wrap(async (req, res) => {
  await communities.banHandle(req.params.name, actorOf(req), req.body);
  res.status(204).send();
});

export const unbanViaRef = wrap(async (req, res) => {
  await communities.unbanViaRef(req.params.name, actorOf(req), req.params.ref);
  res.status(204).send();
});

export const unbanUser = wrap(async (req, res) => {
  await communities.unbanHandle(req.params.name, actorOf(req), req.params.handle);
  res.status(204).send();
});

// ------------------------------------------------------------------ feeds

export const homeFeed = wrap(async (req, res) => {
  res.status(200).json(await feeds.homeFeed(viewerOf(req), req.query));
});

export const popularFeed = wrap(async (req, res) => {
  res.status(200).json(await feeds.popularFeed(viewerOf(req), req.query));
});

export const communityFeed = wrap(async (req, res) => {
  res.status(200).json(await feeds.communityFeed(req.params.name, viewerOf(req), req.query));
});

export const userPosts = wrap(async (req, res) => {
  res.status(200).json(await feeds.userPosts(req.params.handle, viewerOf(req), req.query));
});

export const savedPosts = wrap(async (req, res) => {
  res.status(200).json(await feeds.savedPosts(req.forumUser.user_id, req.query));
});

// ------------------------------------------------------------------ posts

export const imageUploadUrl = wrap(async (req, res) => {
  res.status(200).json(await uploads.createImageUploadUrl(req.forumUser.user_id, req.body));
});

export const createPost = wrap(async (req, res) => {
  res.status(201).json(await posts.createPost(actorOf(req), req.body));
});

export const getPost = wrap(async (req, res) => {
  res.status(200).json(await posts.getPost(req.params.id, viewerOf(req), req.user?.role === "admin"));
});

export const editPost = wrap(async (req, res) => {
  res.status(200).json(await posts.editPost(actorOf(req), req.params.id, req.body));
});

export const deletePost = wrap(async (req, res) => {
  await posts.deletePost(actorOf(req), req.params.id);
  res.status(204).send();
});

export const votePost = wrap(async (req, res) => {
  res.status(200).json(await votes.votePost(req.forumUser.user_id, req.params.id, req.body?.value));
});

const postToggle = (fn) => wrap(async (req, res) => {
  await fn(req.forumUser.user_id, req.params.id);
  res.status(204).send();
});

export const savePost = postToggle(posts.savePost);
export const unsavePost = postToggle(posts.unsavePost);
export const hidePost = postToggle(posts.hidePost);
export const unhidePost = postToggle(posts.unhidePost);
export const blockPostAuthor = postToggle(posts.blockPostAuthor);

// --------------------------------------------------------------- comments

const isAdminReq = (req) => req.user?.role === "admin";

export const listComments = wrap(async (req, res) => {
  res.status(200).json(await comments.getComments(req.params.id, viewerOf(req), req.query, isAdminReq(req)));
});

export const listReplies = wrap(async (req, res) => {
  res.status(200).json(await comments.getReplies(req.params.id, viewerOf(req), req.query, isAdminReq(req)));
});

export const createComment = wrap(async (req, res) => {
  res.status(201).json(await comments.createComment(actorOf(req), req.params.id, req.body));
});

export const editComment = wrap(async (req, res) => {
  res.status(200).json(await comments.editComment(actorOf(req), req.params.id, req.body));
});

export const deleteComment = wrap(async (req, res) => {
  await comments.deleteComment(actorOf(req), req.params.id);
  res.status(204).send();
});

export const voteComment = wrap(async (req, res) => {
  res.status(200).json(await votes.voteComment(req.forumUser.user_id, req.params.id, req.body?.value));
});

export const blockCommentAuthor = postToggle(comments.blockCommentAuthor);

export const userComments = wrap(async (req, res) => {
  res.status(200).json(await comments.userComments(req.params.handle, viewerOf(req), req.query));
});

// ----------------------------------------------------------------- search

export const search = wrap(async (req, res) => {
  res.status(200).json(await searchService.search(viewerOf(req), req.query));
});

export const suggest = wrap(async (req, res) => {
  res.status(200).json(await searchService.suggest(viewerOf(req), req.query.q));
});

// ------------------------------------------------------------- moderation

export const reportPost = wrap(async (req, res) => {
  res.status(201).json(await moderation.report(actorOf(req), "post", req.params.id, req.body));
});

export const reportComment = wrap(async (req, res) => {
  res.status(201).json(await moderation.report(actorOf(req), "comment", req.params.id, req.body));
});

const modAction = (fn) => wrap(async (req, res) => {
  res.status(200).json((await fn(req)) ?? { ok: true });
});

export const removePost = modAction((req) => moderation.removeContent(actorOf(req), "post", req.params.id, req.body));
export const approvePost = modAction((req) => moderation.approveContent(actorOf(req), "post", req.params.id));
export const removeComment = modAction((req) => moderation.removeContent(actorOf(req), "comment", req.params.id, req.body));
export const approveComment = modAction((req) => moderation.approveContent(actorOf(req), "comment", req.params.id));
export const pinPost = modAction((req) => moderation.setPinned(actorOf(req), req.params.id, true));
export const unpinPost = modAction((req) => moderation.setPinned(actorOf(req), req.params.id, false));
export const lockPost = modAction((req) => moderation.setLocked(actorOf(req), req.params.id, true));
export const unlockPost = modAction((req) => moderation.setLocked(actorOf(req), req.params.id, false));
export const banPostAuthor = modAction((req) => moderation.banAuthorOf(actorOf(req), "post", req.params.id, req.body));
export const banCommentAuthor = modAction((req) => moderation.banAuthorOf(actorOf(req), "comment", req.params.id, req.body));
export const resolveReport = modAction((req) => moderation.setReportStatus(actorOf(req), req.params.reportId, "resolved"));
export const dismissReport = modAction((req) => moderation.setReportStatus(actorOf(req), req.params.reportId, "dismissed"));

export const modQueue = wrap(async (req, res) => {
  res.status(200).json(await moderation.modQueue(req.params.name, actorOf(req), req.query));
});

export const modLog = wrap(async (req, res) => {
  res.status(200).json(await moderation.modLog(req.params.name, actorOf(req), req.query));
});

// ------------------------------------------------------------- site admin

export const adminQueue = wrap(async (req, res) => {
  res.status(200).json(await moderation.adminQueue(actorOf(req), req.query));
});

export const revealAnonymousAuthor = wrap(async (req, res) => {
  res.status(200).json(await moderation.revealAnonymousAuthor(actorOf(req), req.params.type, req.params.id, req.body));
});

export const siteBan = modAction((req) => moderation.siteBan(actorOf(req), req.params.handle, req.body));
export const siteUnban = modAction((req) => moderation.siteUnban(actorOf(req), req.params.handle));
export const removeCommunity = modAction((req) => moderation.removeCommunity(actorOf(req), req.params.name, req.body));

// ------------------------------------------------------------------ share

export const sharePreview = async (req, res) => {
  try {
    const { status, html } = await postPreviewHtml(req.params.id);
    res.status(status).set("Cache-Control", "public, max-age=300").type("html").send(html);
  } catch (error) {
    console.error("Share preview error:", error);
    res.status(500).type("html").send("<!doctype html><title>NITKKR PYQs Forum</title>");
  }
};
