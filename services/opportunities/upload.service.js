import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { query } from "../../config/pg.js";
import { HttpError } from "../httpError.js";
import { assetUrl } from "./serialize.js";

// Reuses the generic R2 bucket (R2_BUCKET_NAME) opportunities weren't given
// a dedicated one; set R2_OPPORTUNITIES_BUCKET to use a separate bucket later.
const bucket = () => process.env.R2_OPPORTUNITIES_BUCKET || process.env.R2_BUCKET_NAME;

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_FORUM_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: Boolean(process.env.R2_FORUM_ENDPOINT),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const PURPOSES = {
  "opportunity-logo": { prefix: "opportunities/logos", types: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }, maxBytes: 500_000 },
  "opportunity-attachment": { prefix: "opportunities/attachments", types: { "application/pdf": "pdf" }, maxBytes: 10_000_000 },
  resume: { prefix: "opportunities/resumes", types: { "application/pdf": "pdf" }, maxBytes: 10_000_000 },
};

const PENDING_TTL_HOURS = 24;

/** Presigned PUT for a logo/attachment/resume, discriminated by `purpose` — matches the frontend's generic `presignUpload(token, purpose, contentType)`. */
export const createPresignedUpload = async (userId, body = {}) => {
  const config = PURPOSES[body.purpose];
  if (!config) throw new HttpError(400, "Unknown upload purpose");
  const ext = config.types[body.contentType];
  if (!ext) throw new HttpError(400, "That file type isn't supported for this upload");

  const key = `${config.prefix}/${userId}/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: body.contentType }),
    { expiresIn: 300, signableHeaders: new Set(["content-type"]) },
  );
  await query(
    "INSERT INTO opportunity_uploads (key, user_id, purpose, content_type) VALUES ($1, $2, $3, $4)",
    [key, userId, body.purpose, body.contentType],
  );
  return { key, url: assetUrl(key), uploadUrl };
};

/**
 * Verifies a key is the caller's own pending upload of the right purpose and
 * re-checks the actual uploaded object server-side (size/type), then marks it
 * attached. Throws if the upload doesn't check out — never trust the client's
 * word on what it actually PUT.
 */
export const verifyAndAttachUpload = async (userId, key, expectedPurpose) => {
  if (!key) return null;
  const { rows: [pending] } = await query(
    "SELECT * FROM opportunity_uploads WHERE key = $1 AND user_id = $2 AND purpose = $3 AND status = 'pending'",
    [key, userId, expectedPurpose],
  );
  if (!pending) throw new HttpError(400, "That upload wasn't found or was already used");

  const config = PURPOSES[expectedPurpose];
  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    throw new HttpError(400, "That upload didn't finish — try again");
  }
  if (!config.types[head.ContentType] || head.ContentLength > config.maxBytes) {
    throw new HttpError(400, "The uploaded file doesn't match what was expected");
  }

  await query("UPDATE opportunity_uploads SET status = 'attached' WHERE key = $1", [key]);
  return key;
};

const deleteObjectQuietly = (key) =>
  s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch((err) =>
    console.error("Opportunity upload delete failed:", key, err.message),
  );

/** Deletes uploads never attached to an opportunity (abandoned drafts) after 24h. */
export const sweepPendingOpportunityUploads = async () => {
  const { rows } = await query(
    `DELETE FROM opportunity_uploads WHERE key IN (
       SELECT key FROM opportunity_uploads
        WHERE status = 'pending' AND created_at < now() - make_interval(hours => $1)
        LIMIT 500)
     RETURNING key`,
    [PENDING_TTL_HOURS],
  );
  await Promise.all(rows.map((r) => deleteObjectQuietly(r.key)));
  return rows.length;
};

export const startOpportunityUploadCleanup = () => {
  const run = () =>
    sweepPendingOpportunityUploads()
      .then((n) => n && console.log(`Opportunity upload cleanup: removed ${n} abandoned files`))
      .catch((err) => console.error("Opportunity upload cleanup failed:", err.message));
  setInterval(run, 60 * 60 * 1000).unref();
  console.log("Opportunity upload cleanup scheduler started (hourly)");
};
