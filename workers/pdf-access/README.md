# pdf-access-worker

Fronts the private R2 bucket that stores question paper PDFs. Serves an
object only when handed a short-lived HMAC-signed token minted by the main
backend (`back/services/pdfAccessToken.service.js`) — never serves the
bucket's contents directly, and never accepts a raw object key.

## How it fits together

```
User clicks Download/View
  -> Express: authenticate + requirePremiumOrQuota (existing gate, unchanged)
  -> Express: generateAccessToken({ key, disposition, filename })
  -> Express responds 302 -> https://pdf.<domain>/access/<token>
  -> Browser's fetch follows the redirect automatically
  -> This Worker: verify signature -> check expiry -> R2.get(key) -> stream PDF back
```

If the token is missing, malformed, tampered with, or expired, the Worker
returns `403` and never touches R2.

## One-time setup (Cloudflare dashboard + CLI)

1. **Make the bucket private.** In the Cloudflare dashboard, open the R2
   bucket used for papers and remove any public access — specifically, if
   `pdf.<yourdomain>` is currently attached to the bucket as a **Custom
   Domain** (R2 bucket → Settings → Custom Domains) or public dev URL is
   enabled, disable/remove that. After this step the bucket must not be
   reachable by any direct URL — only through this Worker's R2 binding.

2. **Install dependencies and log in to Wrangler**, from this directory:
   ```
   cd back/workers/pdf-access
   npm install
   npx wrangler login
   ```

3. **Fill in the bucket name** in `wrangler.toml` — replace
   `REPLACE_WITH_YOUR_R2_BUCKET_NAME` with the same value as `R2_BUCKET_NAME`
   in `back/.env`.

4. **Set the signing secret** (must be byte-for-byte identical to
   `PDF_ACCESS_SECRET` in `back/.env` — generate one if you haven't already,
   e.g. `openssl rand -hex 32`):
   ```
   npx wrangler secret put PDF_ACCESS_SECRET
   ```

5. **Deploy**:
   ```
   npm run deploy
   ```

6. **Attach the Worker to `pdf.<yourdomain>`** — Cloudflare dashboard →
   Workers & Pages → `pdf-access-worker` → Settings → Domains & Routes → add
   a **Custom Domain** for `pdf.<yourdomain>` (this replaces the R2 custom
   domain you removed in step 1 — the same hostname now points at the Worker
   instead of straight at the bucket).

## Local testing

```
npm run dev
```
Wrangler will print a local URL; hit `/access/<token>` with a token minted
by calling `generateAccessToken` from the backend (e.g. via a quick Node
`node -e` snippet, or a temporary console.log while testing) to confirm a
valid token returns the PDF, and a tampered/expired one returns 403.

## Security notes

- **Not one-time-use.** A valid token can be reused for its whole lifetime
  (`PDF_ACCESS_TTL_SECONDS`, default 600s) — the same model S3/GCS presigned
  URLs use. This is intentional: enforcing single-use would require a shared
  mutable store (e.g. Cloudflare KV) checked on every request, which adds
  latency and a failure mode (retries, multi-tab opens, browser prefetch
  would all break) for a fairly narrow threat (someone forwarding the link
  within its ~10 minute window).
- **If you do want one-time-use later**: add a KV namespace binding (e.g.
  `USED_TOKENS`), include a random `jti` in the signed payload, and on each
  request do `env.USED_TOKENS.get(jti)` → if present, `forbidden()`;
  otherwise `env.USED_TOKENS.put(jti, "1", { expirationTtl: <remaining
  token lifetime> })` before serving. Not implemented here by default.
- The signature covers the *entire* payload (object key, expiry, disposition,
  filename) — changing any one of them invalidates the token, so there's no
  way to swap in a different object key or extend the expiry without the
  secret.
- `Cache-Control: private, max-age=0, no-store` is set on every response so
  shared caches (including Cloudflare's own edge cache) never serve one
  user's file to another.
