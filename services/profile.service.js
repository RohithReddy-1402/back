import { randomUUID } from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import mongoose from "mongoose";

import r2 from "../config/r2.config.js";
import User from "../models/UserSchema.js";
import Contribution from "../models/Contribution.js";
import DownloadLog from "../models/DownloadLog.js";
import Payment from "../models/Payment.js";
import { getRewardRate } from "../config/rewards.config.js";
import { HttpError } from "./httpError.js";
import { query as pgQuery } from "../config/pg.js";

// ---------------------------------------------------------------- avatar ---

export const AVATAR_MAX_BYTES = 512 * 1024; // client downsizes to 256px first, so real files are ~20-60 KB
const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const AVATAR_PREFIX = "avatars/";
const AVATAR_FILE_RE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/;

/** `avatars/<userId>/<file>` → the public path the frontend renders. */
export const avatarUrlFor = (avatarKey) =>
  avatarKey && avatarKey.startsWith(AVATAR_PREFIX)
    ? `/api/profile/avatar/${avatarKey.slice(AVATAR_PREFIX.length)}`
    : null;

// The forum keeps its own copy of the avatar key (so author joins stay in
// Postgres). Best-effort: a forum hiccup must never break avatar changes.
const syncForumAvatar = (userId, key) =>
  pgQuery("UPDATE forum_profiles SET avatar_key = $2 WHERE user_id = $1 AND deleted_at IS NULL", [String(userId), key])
    .catch((err) => console.error("Forum avatar sync failed:", err.message));

const deleteObjectQuietly = (key) =>
  r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })).catch((err) =>
    console.error("R2 avatar delete failed:", key, err.message)
  );

export const createAvatarUploadUrl = async (userId, { contentType, size }) => {
  const ext = AVATAR_TYPES[contentType];
  if (!ext) throw new HttpError(400, "Only JPEG, PNG or WebP images are allowed");
  if (!Number.isInteger(size) || size <= 0 || size > AVATAR_MAX_BYTES) {
    throw new HttpError(400, `Image must be under ${AVATAR_MAX_BYTES / 1024} KB`);
  }

  const key = `${AVATAR_PREFIX}${userId}/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 300 }
  );
  return { key, uploadUrl };
};

export const confirmAvatar = async (userId, key) => {
  const keyRe = new RegExp(`^${AVATAR_PREFIX}${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);
  if (typeof key !== "string" || !keyRe.test(key)) throw new HttpError(400, "Invalid avatar key");

  let head;
  try {
    head = await r2.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  } catch {
    throw new HttpError(400, "Uploaded image not found — please try again");
  }

  if (head.ContentLength > AVATAR_MAX_BYTES || !AVATAR_TYPES[head.ContentType]) {
    await deleteObjectQuietly(key);
    throw new HttpError(400, "Invalid image");
  }

  const previous = await User.findByIdAndUpdate(userId, { $set: { avatarKey: key } }, { new: false }).select("avatarKey");
  if (!previous) throw new HttpError(404, "User not found");
  if (previous.avatarKey && previous.avatarKey !== key) await deleteObjectQuietly(previous.avatarKey);
  await syncForumAvatar(userId, key);

  return { avatarUrl: avatarUrlFor(key) };
};

export const removeAvatar = async (userId) => {
  const previous = await User.findByIdAndUpdate(userId, { $set: { avatarKey: null } }, { new: false }).select("avatarKey");
  if (previous?.avatarKey) await deleteObjectQuietly(previous.avatarKey);
  await syncForumAvatar(userId, null);
};

/** Streams a stored avatar. The filename is a fresh uuid per upload, so no DB lookup is needed. */
export const getAvatarObject = async (userId, file) => {
  if (!OBJECT_ID_RE.test(userId) || !AVATAR_FILE_RE.test(file)) throw new HttpError(404, "Not found");
  try {
    return await r2.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: `${AVATAR_PREFIX}${userId}/${file}` })
    );
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) throw new HttpError(404, "Not found");
    throw err;
  }
};

// --------------------------------------------------------------- profile ---

export const getProfile = async (userId) => {
  const user = await User.findById(userId)
    .select("name EmailID role subscription college rollNumber bio socials avatarKey points stats")
    .lean();
  if (!user) throw new HttpError(404, "User not found");

  const uploads = user.stats?.uploads ?? 0;
  const approved = user.stats?.approved ?? 0;
  const rejected = user.stats?.rejected ?? 0;

  return {
    id: user._id,
    name: user.name,
    email: user.EmailID,
    role: user.role,
    subscription: user.subscription,
    college: user.college ?? "",
    rollNumber: user.rollNumber ?? "",
    bio: user.bio ?? "",
    socials: {
      github: "", linkedin: "", twitter: "", instagram: "", website: "",
      ...(user.socials || {}),
    },
    avatarUrl: avatarUrlFor(user.avatarKey),
    memberSince: user._id.getTimestamp(),
    points: {
      balance: user.points?.balance ?? 0,
      lifetimeEarned: user.points?.lifetimeEarned ?? 0,
    },
    rewardRate: getRewardRate(user),
    stats: { uploads, approved, rejected, pending: Math.max(0, uploads - approved - rejected) },
  };
};

const SOCIAL_KEYS = ["github", "linkedin", "twitter", "instagram", "website"];
const EDITABLE_KEYS = ["name", "college", "rollNumber", "bio", "socials"];

const cleanText = (value, field, max, { required = false, min = 0 } = {}) => {
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text`);
  const v = value.trim();
  if (required && v.length < Math.max(min, 1)) throw new HttpError(400, `${field} must be at least ${Math.max(min, 1)} characters`);
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return v;
};

const cleanUrl = (value, field) => {
  const v = cleanText(value, field, 200);
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new HttpError(400, `${field} link is not a valid URL`);
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    throw new HttpError(400, `${field} link is not a valid URL`);
  }
  return url.toString();
};

export const updateProfile = async (userId, body) => {
  if (!body || typeof body !== "object") throw new HttpError(400, "Invalid request");
  const unknown = Object.keys(body).filter((k) => !EDITABLE_KEYS.includes(k));
  if (unknown.length) throw new HttpError(400, `Cannot edit: ${unknown.join(", ")}`);

  const $set = {};
  if ("name" in body) $set.name = cleanText(body.name, "Username", 50, { required: true, min: 2 });
  if ("college" in body) $set.college = cleanText(body.college, "College", 100);
  if ("rollNumber" in body) {
    const roll = cleanText(body.rollNumber, "Roll number", 30);
    if (roll && !/^[A-Za-z0-9 _\-/.]+$/.test(roll)) throw new HttpError(400, "Roll number has invalid characters");
    $set.rollNumber = roll;
  }
  if ("bio" in body) $set.bio = cleanText(body.bio, "Bio", 300);
  if ("socials" in body) {
    const socials = body.socials;
    if (!socials || typeof socials !== "object") throw new HttpError(400, "Invalid socials");
    for (const key of Object.keys(socials)) {
      if (!SOCIAL_KEYS.includes(key)) throw new HttpError(400, `Unknown social link: ${key}`);
      $set[`socials.${key}`] = cleanUrl(socials[key], key);
    }
  }
  if (!Object.keys($set).length) throw new HttpError(400, "Nothing to update");

  const updated = await User.findByIdAndUpdate(userId, { $set }, { new: true, runValidators: true }).select("_id");
  if (!updated) throw new HttpError(404, "User not found");
  return getProfile(userId);
};

// -------------------------------------------------------------- histories ---

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const parseLimit = (raw) => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_LIMIT) : DEFAULT_LIMIT;
};

const encodeCursor = (doc) => `${new Date(doc.createdAt).getTime()}_${doc._id}`;

const decodeCursor = (raw) => {
  if (!raw) return null;
  const [ms, id] = String(raw).split("_");
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime()) || !OBJECT_ID_RE.test(id || "")) throw new HttpError(400, "Invalid cursor");
  return { date, id: new mongoose.Types.ObjectId(id) };
};

/**
 * Keyset pagination (newest first) — no `skip`, so page N costs the same as
 * page 1. Fetches limit+1 rows to learn `hasMore` without a count query.
 */
export const paginate = async (Model, filter, { select, query = {} }) => {
  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.before);
  const finalFilter = cursor
    ? { ...filter, $or: [{ createdAt: { $lt: cursor.date } }, { createdAt: cursor.date, _id: { $lt: cursor.id } }] }
    : filter;

  const rows = await Model.find(finalFilter).select(select).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, hasMore, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
};

export const listUploads = (userId, query) =>
  paginate(Contribution, { userId }, {
    query,
    select:
      "title subject subjectCode sem year examType status rejectReason rejectNote " +
      "rewardPoints bonusPoints bonusReason bonusNote createdAt reviewedAt",
  });

export const listDownloads = (userId, query) =>
  paginate(DownloadLog, { userId, action: "download" }, {
    query,
    select: "resourceType resourceId resourceTitle resourceSubject createdAt",
  });

export const listPayments = (userId, query) =>
  paginate(Payment, { userId, status: "paid" }, {
    query,
    select: "plan amount currency razorpayPaymentId createdAt verifiedAt",
  });
