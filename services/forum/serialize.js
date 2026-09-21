import { avatarUrlFor } from "../profile.service.js";
import { toId36 } from "./ids.js";

// Row → API shape. Anonymity masking happens here and ONLY here: services
// select author columns freely, and this file decides what leaves the server.

const IMG_BASE = () => (process.env.FORUM_IMG_BASE_URL || "").replace(/\/$/, "");

/** Public URL for an object in the forum R2 bucket. */
export const assetUrl = (key) => (key ? `${IMG_BASE()}/${key}` : null);

export const serializeMyProfile = (row) =>
  row && {
    handle: row.handle,
    avatarUrl: avatarUrlFor(row.avatar_key),
    bio: row.bio,
    postKarma: row.post_karma,
    commentKarma: row.comment_karma,
    // Permanent bans are Postgres 'infinity', which pg parses to Infinity.
    bannedUntil: row.banned_until === Infinity ? "forever" : row.banned_until,
    createdAt: row.created_at,
  };

export const serializePublicProfile = (row, viewerId) => ({
  handle: row.handle,
  avatarUrl: avatarUrlFor(row.avatar_key),
  bio: row.bio,
  postKarma: row.post_karma,
  commentKarma: row.comment_karma,
  karma: row.post_karma + row.comment_karma,
  createdAt: row.created_at,
  isMe: viewerId === row.user_id,
  isBlocked: Boolean(row.is_blocked),
});

export const serializeCommunity = (row) => ({
  name: row.name,
  title: row.title,
  description: row.description,
  rules: row.rules,
  iconUrl: assetUrl(row.icon_key),
  bannerUrl: assetUrl(row.banner_key),
  type: row.type,
  allowImages: row.allow_images,
  memberCount: row.member_count,
  postCount: row.post_count,
  createdAt: row.created_at,
  // Viewer-specific; absent (null) for logged-out viewers.
  myRole: row.my_role ?? null,
  isBanned: Boolean(row.is_banned),
});

export const serializeCommunityBrief = (row) => ({
  name: row.name,
  title: row.title,
  iconUrl: assetUrl(row.icon_key),
  memberCount: row.member_count,
  myRole: row.my_role ?? null,
});

/** Reddit-style URL slug from a title: "CGPA cutoff?" → "cgpa_cutoff". */
export const slugify = (title) =>
  String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50)
    .replace(/_+$/, "") || "post";

export const postShareUrl = (communityName, id, title) =>
  `${(process.env.FORUM_SHARE_BASE_URL || "https://nitkkrpyqs.in").replace(/\/$/, "")}` +
  `/forum/c/${communityName}/p/${toId36(id)}/${slugify(title)}`;

/**
 * Anonymous, deleted-author and author-deleted content never exposes the
 * author. Removed/deleted content is a tombstone for everyone except its
 * author and (for removals) the community's moderators.
 */
const authorOf = (row, hide) =>
  hide || row.author_deleted_at ? null : { handle: row.author_handle, avatarUrl: avatarUrlFor(row.author_avatar_key) };

export const serializePost = (row, viewerId = null, { isMod = false } = {}) => {
  const isMine = Boolean(viewerId) && viewerId === row.author_id;
  const isDeleted = Boolean(row.deleted_at);
  const isRemoved = Boolean(row.removed_at);
  const canSeeContent = !isDeleted && (!isRemoved || isMine || isMod);

  return {
    id: toId36(row.id),
    community: { name: row.community_name, iconUrl: assetUrl(row.community_icon_key) },
    author: authorOf(row, row.is_anonymous || isDeleted),
    isAnonymous: row.is_anonymous,
    isMine,
    kind: row.kind,
    title: row.title,
    body: canSeeContent ? row.body : "",
    bodyFormat: row.body_format,
    url: canSeeContent ? row.url : null,
    images: canSeeContent
      ? (row.images || []).map((img) => ({ url: assetUrl(img.key), width: img.width, height: img.height }))
      : [],
    flair: row.flair,
    score: row.score,
    myVote: row.my_vote ?? 0,
    saved: Boolean(row.saved),
    commentCount: row.comment_count,
    isPinned: row.is_pinned,
    isLocked: row.is_locked,
    isRemoved,
    isDeleted,
    removalReason: isRemoved && (isMine || isMod) ? row.removal_reason : null,
    isEdited: Boolean(row.edited_at),
    createdAt: row.created_at,
    shareUrl: postShareUrl(row.community_name, row.id, row.title),
  };
};

/**
 * `post` is `{ author_id, is_anonymous }` of the parent post, used for the OP
 * badge — shown only when both post and comment are named, since otherwise it
 * would link an anonymous post/comment to a named one.
 */
export const serializeComment = (row, viewerId = null, { isMod = false, post = null } = {}) => {
  const isMine = Boolean(viewerId) && viewerId === row.author_id;
  const isDeleted = Boolean(row.deleted_at);
  const isRemoved = Boolean(row.removed_at);
  const isBlocked = Boolean(row.is_blocked_author) && !isMine;
  const canSeeContent = !isDeleted && !isBlocked && (!isRemoved || isMine || isMod);

  return {
    id: toId36(row.id),
    parentId: row.parent_id ? toId36(row.parent_id) : null,
    depth: row.depth,
    author: authorOf(row, row.is_anonymous || isDeleted || isBlocked),
    isAnonymous: row.is_anonymous,
    isMine,
    isOp: Boolean(post) && !post.is_anonymous && !row.is_anonymous && post.author_id === row.author_id,
    body: canSeeContent ? row.body : "",
    score: row.score,
    myVote: row.my_vote ?? 0,
    replyCount: row.reply_count,
    isRemoved,
    isDeleted,
    isBlocked,
    removalReason: isRemoved && (isMine || isMod) ? row.removal_reason : null,
    isEdited: Boolean(row.edited_at),
    createdAt: row.created_at,
  };
};
