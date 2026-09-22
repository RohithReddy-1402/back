import { GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

import r2 from "../config/r2.config.js";
import Paper from "../models/PaperSchema.js";
import { watermarkPdfBuffer, DEFAULT_WATERMARK_TEXT } from "./watermark.service.js";

const bucket = () => process.env.R2_BUCKET_NAME;

async function getObjectBuffer(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

async function headObject(key) {
  try {
    return await r2.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

async function putAndVerify(key, buffer) {
  await r2.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer, ContentType: "application/pdf" }));
  const head = await headObject(key);
  if (!head) throw new Error(`Watermark upload verification failed: ${key} not found in R2 after upload`);
  if (Number(head.ContentLength) !== buffer.length) {
    throw new Error(
      `Watermark upload verification failed: ${key} size mismatch (expected ${buffer.length}, got ${head.ContentLength})`
    );
  }
  return head;
}

const deleteObjectQuietly = (key) =>
  r2.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch((err) =>
    console.error(`watermark pipeline: failed to delete old object ${key}:`, err.message)
  );

const stagingKeyFor = (sourceKey) =>
  sourceKey.endsWith(".pdf") ? sourceKey.replace(/\.pdf$/, "-wm.pdf") : `${sourceKey}-wm.pdf`;

export async function watermarkAndSwap(paperDoc, { text = DEFAULT_WATERMARK_TEXT, dryRun = false } = {}) {
  const sourceKey = paperDoc.r2Key;
  if (!sourceKey) throw new Error(`Paper ${paperDoc.paper_id} has no r2Key`);
  const targetKey = stagingKeyFor(sourceKey);

  const original = await getObjectBuffer(sourceKey);
  const watermarked = await watermarkPdfBuffer(original, { text });

  if (dryRun) {
    return { paperId: paperDoc.paper_id, sourceKey, targetKey, applied: false, dryRun: true };
  }

  const head = await putAndVerify(targetKey, watermarked);

  const updated = await Paper.findOneAndUpdate(
    { _id: paperDoc._id, r2Key: sourceKey },
    { $set: { r2Key: targetKey, r2ETag: head.ETag, watermarked: true, watermarkedAt: new Date() } },
    { new: true }
  );

  if (!updated) {
    await deleteObjectQuietly(targetKey);
    return { paperId: paperDoc.paper_id, applied: false, reason: "already processed (race)" };
  }

  if (sourceKey !== targetKey) await deleteObjectQuietly(sourceKey);

  return { paperId: paperDoc.paper_id, sourceKey, targetKey, etag: head.ETag, applied: true };
}
