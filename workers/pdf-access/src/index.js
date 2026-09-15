/**
 * Fronts a private R2 bucket with short-lived, HMAC-signed access tokens.
 * Tokens are minted by the Express backend (services/pdfAccessToken.service.js)
 * only after its own login + premium/quota gate passes — this Worker's only
 * job is: verify the token, then serve (or refuse) the object.
 *
 * URL shape: https://pdf.<domain>/access/<payloadB64>.<signatureB64>
 * payload = { key, exp, disposition, filename }
 */

function base64UrlToBytes(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifySignature(secret, payloadB64, signatureB64) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  // crypto.subtle.verify does a constant-time comparison internally — no
  // hand-rolled comparison needed.
  return crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(payloadB64)
  );
}

function decodePayload(payloadB64) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
}

function sanitizeFilename(name) {
  return String(name).replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 150);
}

function forbidden(reason, corsHeaders) {
  return new Response(`Forbidden${reason ? `: ${reason}` : ""}`, { status: 403, headers: corsHeaders });
}

// The frontend's fetch wrapper sends every request with `credentials:
// "include"` (needed elsewhere for its cookie-fallback auth), and that mode
// carries through automatic redirects — including this one, even though
// this Worker itself doesn't use cookies at all. Per the CORS spec, a
// credentialed request can't be answered with a wildcard
// Access-Control-Allow-Origin; it must echo back the exact requesting
// origin plus Access-Control-Allow-Credentials, or browsers silently reject
// the response (surfacing as a generic "Failed to fetch").
function corsHeadersFor(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const corsHeaders = corsHeadersFor(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/access\/([^/]+)$/);
    if (!match) return forbidden("bad path", corsHeaders);

    const token = match[1];
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return forbidden("malformed token", corsHeaders);

    const payloadB64 = token.slice(0, dotIndex);
    const signatureB64 = token.slice(dotIndex + 1);

    let valid = false;
    try {
      valid = await verifySignature(env.PDF_ACCESS_SECRET, payloadB64, signatureB64);
    } catch {
      return forbidden("signature check failed", corsHeaders);
    }
    if (!valid) return forbidden("invalid signature", corsHeaders);

    let payload;
    try {
      payload = decodePayload(payloadB64);
    } catch {
      return forbidden("malformed payload", corsHeaders);
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload.key || !payload.exp) return forbidden("incomplete token", corsHeaders);
    if (payload.exp < now) return forbidden("expired", corsHeaders);

    const object = await env.PDF_BUCKET.get(payload.key);
    if (!object) return forbidden("not found", corsHeaders);

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/pdf");
    const disposition = payload.disposition === "attachment" ? "attachment" : "inline";
    const filename = sanitizeFilename(payload.filename || "document");
    headers.set("Content-Disposition", `${disposition}; filename="${filename}.pdf"`);
    // Tokens are single-purpose and short-lived — never cache the response
    // (shared caches could otherwise serve one user's file to another).
    headers.set("Cache-Control", "private, max-age=0, no-store");

    return new Response(object.body, { status: 200, headers });
  },
};
