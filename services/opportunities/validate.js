import { nanoid } from "nanoid";
import { query } from "../../config/pg.js";
import { HttpError } from "../httpError.js";

export const OPPORTUNITY_TYPES = [
  "internship", "full_time", "part_time", "research_internship", "research_opportunity",
  "fellowship", "scholarship", "hackathon", "competition", "workshop", "certification",
  "government", "other",
];
export const OPPORTUNITY_STATUSES = ["draft", "scheduled", "published", "archived", "rejected"];
export const VERIFICATION_STATUSES = ["verified", "pending", "expired", "reported", "under_review"];
export const WORK_MODES = ["remote", "hybrid", "onsite"];

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

export const cleanNumber = (value, field, { min, max, optional = true } = {}) => {
  if (value === undefined || value === null || value === "") return optional ? undefined : (() => { throw new HttpError(400, `${field} is required`); })();
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a number`);
  if (min !== undefined && n < min) throw new HttpError(400, `${field} must be at least ${min}`);
  if (max !== undefined && n > max) throw new HttpError(400, `${field} must be at most ${max}`);
  return n;
};

/** `["CSE", "ece", "CSE"]` → `["CSE", "ECE"]` — dedupes, trims, uppercases, caps length. */
export const cleanStringArray = (value, field, { max = 20, itemMax = 50, upper = false } = {}) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be a list`);
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    let item = raw.trim().slice(0, itemMax);
    if (!item) continue;
    if (upper) item = item.toUpperCase();
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
};

export const cleanDate = (value, field) => {
  if (value === undefined || value === null || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${field} isn't a valid date`);
  return d.toISOString();
};

const slugifyPart = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "Software Engineer Intern" + "Google" → "software-engineer-intern-google", unique. */
export const uniqueSlug = async (title, companyName) => {
  const base = `${slugifyPart(title)}-${slugifyPart(companyName)}`.replace(/-+/g, "-").slice(0, 70).replace(/-+$/, "") || "opportunity";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${nanoid(5).toLowerCase()}`;
    const { rowCount } = await query("SELECT 1 FROM opportunities WHERE slug = $1", [candidate]);
    if (!rowCount) return candidate;
  }
  return `${base}-${nanoid(8).toLowerCase()}`;
};

export const cleanAttachments = (value) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "Attachments must be a list");
  return value.slice(0, 10).map((a, i) => {
    if (typeof a?.url !== "string" || typeof a?.name !== "string") {
      throw new HttpError(400, `Attachment ${i + 1} is invalid`);
    }
    return { name: a.name.slice(0, 200), url: a.url, size: Number(a.size) || undefined };
  });
};
