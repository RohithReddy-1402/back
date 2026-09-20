import { query } from "../../config/pg.js";
import { fromId36 } from "./ids.js";
import { assetUrl, postShareUrl } from "./serialize.js";

// Link-preview HTML for crawlers (WhatsApp, Telegram, Discord, …). The web
// app's edge middleware rewrites bot requests for /forum/* to this endpoint;
// people get the SPA. Nothing here may reveal an anonymous author.

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const truncate = (s, n) => {
  const text = String(s || "").replace(/\s+/g, " ").trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

const page = ({ title, description, url, image, imageAlt }) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:site_name" content="NITKKR PYQs Forum">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(image)}">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(url)}">
</head><body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(url)}">Open on NITKKR PYQs</a></p>
</body></html>`;

const unavailable = () =>
  page({
    title: "Post unavailable · NITKKR PYQs Forum",
    description: "This post was deleted or removed.",
    url: `${(process.env.FORUM_SHARE_BASE_URL || "https://nitkkrpyqs.in").replace(/\/$/, "")}/forum`,
  });

/** Returns `{ status, html }` for a post's preview card. */
export const postPreviewHtml = async (id36) => {
  let id;
  try {
    id = fromId36(id36);
  } catch {
    return { status: 404, html: unavailable() };
  }
  const { rows: [p] } = await query(
    `SELECT p.id, p.title, p.body, p.kind, p.url, p.score, p.comment_count, p.removed_at, p.deleted_at,
            c.name AS community_name,
            (SELECT key FROM post_images i WHERE i.post_id = p.id ORDER BY position LIMIT 1) AS image_key
       FROM posts p JOIN communities c ON c.id = p.community_id AND c.removed_at IS NULL
      WHERE p.id = $1`,
    [id],
  );
  if (!p || p.removed_at || p.deleted_at) return { status: 404, html: unavailable() };

  const stats = `${p.score} point${p.score === 1 ? "" : "s"} · ${p.comment_count} comment${p.comment_count === 1 ? "" : "s"}`;
  const description = truncate(p.body, 180) || (p.kind === "link" ? p.url : "") || `Posted in c/${p.community_name}`;
  return {
    status: 200,
    html: page({
      title: `${truncate(p.title, 110)} · c/${p.community_name}`,
      description: `${stats} — ${description}`,
      url: postShareUrl(p.community_name, p.id, p.title),
      image: assetUrl(p.image_key),
      imageAlt: truncate(p.title, 100),
    }),
  };
};
