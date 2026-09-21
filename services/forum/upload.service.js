import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { query } from "../../config/pg.js";
import { HttpError } from "../httpError.js";
import { assetUrl } from "./serialize.js";

// Forum images live in their own PUBLIC bucket (served at FORUM_IMG_BASE_URL
// via Cloudflare's CDN), separate from the private papers bucket.
export const IMAGE_MAX_BYTES = 512_000;
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGES = 4;
const PENDING_TTL_HOURS = 24;

const s3 = new S3Client({
  region: "auto",
  // R2_FORUM_ENDPOINT is optional (e.g. a local S3-compatible server in dev).
  endpoint: process.env.R2_FORUM_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: Boolean(process.env.R2_FORUM_ENDPOINT),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const bucket = () => process.env.R2_FORUM_BUCKET;

const deleteObjectQuietly = (key) =>
  s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch((err) =>
    console.error("Forum image delete failed:", key, err.message),
  );

/**
 * Presigned PUT for one image. Content-Length is part of the signature, so
 * the storage server itself rejects a body of any other size.
 */
export const createImageUploadUrl = async (userId, body = {}) => {
  const ext = IMAGE_TYPES[body.contentType];
  if (!ext) throw new HttpError(400, "Only JPEG, PNG or WebP images are allowed");
  const bytes = Number(body.bytes);
  if (!Number.isInteger(bytes) || bytes <= 0) throw new HttpError(400, "Image size is required");
  if (bytes > IMAGE_MAX_BYTES) throw new HttpError(413, "Images must be 500 KB or smaller");

  const key = `forum/${userId}/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: body.contentType, ContentLength: bytes }),
    { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) },
  );
  await query(
    "INSERT INTO uploads (key, user_id, bytes, content_type) VALUES ($1, $2, $3, $4)",
    [key, userId, bytes, body.contentType],
  );
  return { key, url: assetUrl(key), uploadUrl, method: "PUT", headers: { "Content-Type": body.contentType } };
};

/** Validates `[{ key, width, height }]` from a post request (shape only). */
export const cleanImageList = (images) => {
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) {
    throw new HttpError(400, `Image posts need 1-${MAX_IMAGES} images`);
  }
  const seen = new Set();
  return images.map((img, i) => {
    const width = Number(img?.width);
    const height = Number(img?.height);
    if (typeof img?.key !== "string" || seen.has(img.key)) throw new HttpError(400, `Image ${i + 1} is invalid`);
    if (!(Number.isInteger(width) && width > 0 && width <= 10000 && Number.isInteger(height) && height > 0 && height <= 10000)) {
      throw new HttpError(400, `Image ${i + 1} needs its width and height`);
    }
    seen.add(img.key);
    return { key: img.key, width, height };
  });
};

/**
 * Attaches uploaded images to a post inside the caller's transaction. Each key
 * must be the caller's own pending upload, and the stored object is checked
 * (real size + type) — the client's word is never trusted.
 */
export const attachImages = async (db, userId, postId, images) => {
  const keys = images.map((img) => img.key);
  const { rows } = await db.query(
    "SELECT key FROM uploads WHERE key = ANY($1) AND user_id = $2 AND status = 'pending' FOR UPDATE",
    [keys, userId],
  );
  if (rows.length !== keys.length) throw new HttpError(400, "One or more images weren't uploaded or were already used");

  const heads = await Promise.all(
    keys.map((key) =>
      s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key })).catch(() => {
        throw new HttpError(400, "An image upload didn't finish — try again");
      }),
    ),
  );
  heads.forEach((head) => {
    if (!IMAGE_TYPES[head.ContentType] || !(head.ContentLength <= IMAGE_MAX_BYTES)) {
      throw new HttpError(400, "Images must be JPEG, PNG or WebP and 500 KB or smaller");
    }
  });

  for (const [position, img] of images.entries()) {
    await db.query(
      `INSERT INTO post_images (post_id, position, key, width, height, bytes) VALUES ($1, $2, $3, $4, $5, $6)`,
      [postId, position, img.key, img.width, img.height, heads[position].ContentLength],
    );
  }
  await db.query("UPDATE uploads SET status = 'attached' WHERE key = ANY($1)", [keys]);
};

/**
 * Marks whichever of `keys` are the caller's own pending uploads as
 * attached, so the abandoned-upload sweep won't delete them. Used for images
 * embedded inline in a rich-text post body (as opposed to `attachImages`'
 * `post_images` gallery rows). Silently skips any key that isn't the
 * caller's own pending upload — an inline `<img>` may just as well point at
 * an external URL, which is fine and not an error.
 */
export const markUploadsAttached = async (db, userId, keys) => {
  if (!keys.length) return;
  const { rows } = await db.query(
    "SELECT key FROM uploads WHERE key = ANY($1) AND user_id = $2 AND status = 'pending' FOR UPDATE",
    [keys, userId],
  );
  if (!rows.length) return;
  await db.query("UPDATE uploads SET status = 'attached' WHERE key = ANY($1)", [rows.map((r) => r.key)]);
};

/** Deletes uploads never attached to a post (abandoned drafts) after 24h. */
export const sweepPendingUploads = async () => {
  const { rows } = await query(
    `DELETE FROM uploads WHERE key IN (
       SELECT key FROM uploads
        WHERE status = 'pending' AND created_at < now() - make_interval(hours => $1)
        LIMIT 500)
     RETURNING key`,
    [PENDING_TTL_HOURS],
  );
  await Promise.all(rows.map((r) => deleteObjectQuietly(r.key)));
  return rows.length;
};

export const startForumUploadCleanup = () => {
  const run = () =>
    sweepPendingUploads()
      .then((n) => n && console.log(`Forum upload cleanup: removed ${n} abandoned images`))
      .catch((err) => console.error("Forum upload cleanup failed:", err.message));
  setInterval(run, 60 * 60 * 1000).unref();
  console.log("Forum upload cleanup scheduler started (hourly)");
};
