import sanitizeHtml from "sanitize-html";
import { HttpError } from "../httpError.js";

// Names nobody can take as a handle or community, to prevent impersonation.
const RESERVED = new Set([
  "admin", "admins", "administrator", "mod", "mods", "moderator", "moderators", "official",
  "nitkkr", "nitkkrpyqs", "nit", "support", "help", "staff", "team", "system", "root",
  "anonymous", "anon", "deleted", "removed", "null", "undefined", "me", "all", "popular",
  "home", "search", "submit", "settings", "forum",
]);

export const isReserved = (name) => RESERVED.has(String(name).toLowerCase());

export const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;
export const COMMUNITY_RE = /^[A-Za-z0-9_]{3,21}$/;

/** Trimmed string within [min, max] chars; `undefined` passes through when optional. */
export const cleanText = (value, field, { min = 0, max, optional = false } = {}) => {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text`);
  const text = value.trim();
  if (text.length < min) throw new HttpError(400, min <= 1 ? `${field} is required` : `${field} must be at least ${min} characters`);
  if (max && text.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return text;
};

export const cleanBool = (value, field, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new HttpError(400, `${field} must be true or false`);
  return value;
};

export const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

// The rich post editor sends HTML; this is the only place user-authored HTML
// is allowed to survive as markup anywhere in this codebase, so the allowlist
// is deliberately minimal — no script/style/iframe/event handlers, no
// non-http(s) URL schemes (rules out `javascript:`/`data:` payloads).
const RICH_TEXT_TAGS = ["p", "h1", "h2", "h3", "strong", "em", "s", "u", "ul", "ol", "li", "a", "img", "blockquote", "br"];

export const sanitizeForumHtml = (html) =>
  sanitizeHtml(html, {
    allowedTags: RICH_TEXT_TAGS,
    allowedAttributes: { a: ["href"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    },
  });

/** Postgres unique-violation → 409 with a friendly message. */
export const rethrowUnique = (error, message) => {
  if (error?.code === "23505") throw new HttpError(409, message);
  throw error;
};
