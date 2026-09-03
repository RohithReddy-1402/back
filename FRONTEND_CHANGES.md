# Frontend changes required after the backend update

The backend (branch `feature/mailSystem`) added **Bearer-token auth**, **download
rate limiting**, and **Redis-backed download counts**. This document lists exactly
what the frontend must change. Nothing here needs backend work — it is already
deployed/ready.

API base URL stays the same (e.g. `https://back-6j6v.onrender.com`).

---

## 1. Authentication — switch from cookie to `Authorization: Bearer`

### Why

The session cookie is `SameSite=None; Secure` and the API is on a different
domain than the site, so browsers (Safari always, Chrome increasingly) drop it —
that is why Google login "doesn't stay logged in". The backend already returns a
JWT in the response body of every login route; the frontend must store it and
send it as a header.

### What to do

**On every successful auth response** — `POST /login`, `POST /register`,
`POST /login/google` — the JSON body looks like:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "EmailID": "a@b.com", "username": "Name" }
}
```

1. Save `data.token` (e.g. `localStorage.setItem("token", data.token)`).
   Keep saving `user` however you do now.
2. Keep `credentials: "include"` on requests if you want — it no longer matters,
   but it does no harm.

**On every authenticated request**, add the header:

```js
const token = localStorage.getItem("token");
fetch(`${API}/auth/check`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});
```

Endpoints that need the header:

| Endpoint | Method |
| --- | --- |
| `/auth/check` | GET |
| `/api/stats/downloads` | GET (admin) |
| `/verifiedpaper/papers/:id` | POST (admin) |
| `/deletepaper/papers/:id` | DELETE (admin) |
| any download endpoint (optional — see §2, makes the user unlimited) | — |

3. **Session restore on app load**: call `GET /auth/check` with the stored token.
   - `200` → logged in, use the returned `user`.
   - `401` → token missing/expired, clear it and treat as logged out.

   ```
   GET /auth/check  ->  200 { "user": { "email", "name", "role" } }
                    ->  401 { "message": "Authentication required" | "Invalid token" }
   ```

4. **Logout** is now client-side only: `localStorage.removeItem("token")` and
   clear your in-memory user. You may still call `POST /logout` (it clears the
   legacy cookie) but it is not required.

5. A helper is worth adding once:

   ```js
   export async function apiFetch(path, options = {}) {
     const token = localStorage.getItem("token");
     const res = await fetch(`${API}${path}`, {
       ...options,
       headers: {
         ...(options.headers || {}),
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
     });
     if (res.status === 401) {
       localStorage.removeItem("token");
       // optional: redirect to login
     }
     return res;
   }
   ```

---

## 2. Download rate limiting

### How it works

Anonymous users (no `Authorization` header) are limited **per IP**:

| Window | Limit (default) |
| --- | --- |
| per minute | 3 |
| per hour | 10 |
| per day | 20 |

**Any logged-in user is unlimited** (send the `Authorization: Bearer` header on
the download call and no limit applies). Premium users are also unlimited.

The limit is enforced **on the download request itself** — there is no separate
"check" call to make. The flow is:

```
user clicks Download
        |
        v
call the download endpoint  (with Authorization header if logged in)
        |
   status 200 / 302  -> proceed, file downloads
   status 429        -> over the limit: show the message, do NOT retry immediately
```

### Rate-limited endpoints

All of these now return **`429 Too Many Requests`** when the caller is over the
limit:

- `PATCH /papers/downloadcount`  (body `{ "r2Key": "papers/<uuid>.pdf" }`)
- `GET /papers/:id/download`
- `GET /api/download/papers/:id`
- `GET /api/paper/view/:id`

### The `429` response

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
RateLimit-Limit: 3
RateLimit-Remaining: 0
RateLimit-Reset: 60

{
  "message": "Too many downloads — max 3 per minute. Please slow down.",
  "retryAfter": 60
}
```

- Show `body.message` to the user (toast / inline).
- `body.retryAfter` and the `Retry-After` header are **seconds to wait**
  (60 = a minute cap, 3600 = hourly cap, 86400 = daily cap).
- If the user is not logged in, this is a good moment to prompt: *"Sign in for
  unlimited downloads."*

### Optional: show "downloads left" before the user hits the wall

**Every** response from a rate-limited endpoint (not just 429s) carries:

```
RateLimit-Limit: 20        # daily quota
RateLimit-Remaining: 17    # left in the daily quota
RateLimit-Reset: 84210     # seconds until the daily quota resets
```

(These reflect the **daily** budget — the per-minute/hour caps are just
anti-hammering. CORS is configured to expose these headers to JS.)

```js
const res = await fetch(`${API}/papers/downloadcount`, { method: "PATCH", /* ... */ });
const remaining = Number(res.headers.get("RateLimit-Remaining"));
if (Number.isFinite(remaining)) {
  // e.g. render "17 downloads left today", disable button at 0
}
```

For logged-in users these headers are absent (they are unlimited) — treat missing
headers as "no limit".

### Handling the redirect on `PATCH /papers/downloadcount`

This endpoint responds with `302` to the file URL (unchanged behaviour). Keep
doing whatever you do today (follow the redirect / open `res.url` /
`window.location`). Just add:

- the `Authorization` header (if logged in),
- a branch for `res.status === 429` **before** you try to read the redirect.

---

## 3. Download counts shown in the UI — no change needed

`GET /papers` already returns each paper's `downloads` with the correct value
(the backend merges its database value with counts buffered in Redis). Just keep
reading `paper.downloads` as before.

One behavioural note: a brand-new download may take up to ~60 seconds to be
reflected in `GET /papers` if you re-fetch immediately. If you want the count to
tick up instantly in the UI, optimistically `+1` locally on click.

---

## 4. Quick checklist

- [ ] Store `token` from `/login`, `/register`, `/login/google` responses.
- [ ] Send `Authorization: Bearer <token>` on `/auth/check` and all admin calls.
- [ ] On app load, restore session via `GET /auth/check`; clear token on `401`.
- [ ] Logout = delete stored token locally.
- [ ] Send `Authorization: Bearer <token>` on download calls when logged in (makes them unlimited).
- [ ] Handle `429` on the 4 download endpoints: show `body.message`, respect `Retry-After`, prompt anonymous users to sign in.
- [ ] (Optional) Read `RateLimit-Remaining` to show "N downloads left today" / disable the button at 0.
- [ ] No change to how `paper.downloads` is displayed.
