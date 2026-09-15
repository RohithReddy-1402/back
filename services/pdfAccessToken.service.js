import crypto from "crypto";

const TTL_SECONDS = Number(process.env.PDF_ACCESS_TTL_SECONDS || 600);

const base64url = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const sign = (payloadB64) =>
  base64url(
    crypto.createHmac("sha256", process.env.PDF_ACCESS_SECRET).update(payloadB64).digest()
  );

/**
 * Mints a short-lived signed token for a private R2 object, and the full
 * public URL (fronted by the Cloudflare Worker in back/workers/pdf-access)
 * that redeems it. The object key lives inside the signed payload, not as a
 * separate URL segment, so there's nothing for a client to edit to reach a
 * different object.
 */
export const generateAccessToken = ({ key, disposition = "inline", filename }) => {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = { key, exp, disposition, filename: filename || null };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const token = `${payloadB64}.${sign(payloadB64)}`;
  // PDF_ACCESS_BASE_URL is just the domain (e.g. https://pdf.example.com) —
  // the /access/ segment is hardcoded here (matching the Worker's route
  // pattern in workers/pdf-access/src/index.js) rather than trusted to env
  // config, since a trailing/missing path segment there silently breaks
  // every download/view.
  const base = (process.env.PDF_ACCESS_BASE_URL || "").replace(/\/+$/, "");
  const url = `${base}/access/${token}`;
  return { token, url, expiresAt: new Date(exp * 1000) };
};
