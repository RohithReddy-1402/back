import { query } from "../../config/pg.js";
import { HttpError } from "../httpError.js";
import { serializeOpportunity, serializeOpportunityBrief } from "./serialize.js";
import { verifyAndAttachUpload } from "./upload.service.js";
import {
  cleanAttachments, cleanBool, cleanDate, cleanNumber, cleanStringArray, cleanText,
  oneOf, uniqueSlug, OPPORTUNITY_TYPES, WORK_MODES,
} from "./validate.js";

const STATUSES = ["draft", "scheduled", "published", "archived", "rejected"];
const VERIFICATION_STATUSES = ["verified", "pending", "expired", "reported", "under_review"];

const clampLimit = (n) => Math.min(Math.max(Number(n) || 20, 1), 50);
const encodeCursor = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const decodeCursor = (cursor) => {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

// ------------------------------------------------------------- shared where
/** Builds a parameterized WHERE clause + params array from feed/admin filter params. Mutates neither input. */
function buildFiltersSafe(params, { statusClause, startParams = [] } = {}) {
  const clauses = statusClause ? [statusClause] : [];
  const values = [...startParams];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (params.type && OPPORTUNITY_TYPES.includes(params.type)) clauses.push(`type = ${add(params.type)}`);
  if (params.mode && WORK_MODES.includes(params.mode)) clauses.push(`location_mode = ${add(params.mode)}`);
  if (params.paid === "true" || params.paid === true) clauses.push(`is_paid = ${add(true)}`);
  if (params.branch) clauses.push(`${add(String(params.branch).toUpperCase())} = ANY(eligibility_branches)`);
  if (params.batch) clauses.push(`${add(String(params.batch))} = ANY(eligibility_batches)`);
  if (params.location) clauses.push(`location_text ILIKE ${add(`%${params.location}%`)}`);
  if (params.skills) {
    const skills = String(params.skills).split(",").map((s) => s.trim()).filter(Boolean);
    if (skills.length) {
      const p = add(skills);
      clauses.push(`(skills_required && ${p}::text[] OR skills_preferred && ${p}::text[])`);
    }
  }
  if (params.stipendMin) clauses.push(`stipend >= ${add(cleanNumber(params.stipendMin, "stipendMin"))}`);
  if (params.stipendMax) clauses.push(`stipend <= ${add(cleanNumber(params.stipendMax, "stipendMax"))}`);
  if (params.company) clauses.push(`company_name ILIKE ${add(`%${params.company}%`)}`);
  if (params.q) clauses.push(`search_vec @@ plainto_tsquery('english', ${add(params.q)})`);
  // Admin-only filters — harmless no-ops on the public feed, which never
  // passes these params.
  if (params.status && STATUSES.includes(params.status)) clauses.push(`status = ${add(params.status)}`);
  if (params.verification && VERIFICATION_STATUSES.includes(params.verification)) {
    clauses.push(`verification_status = ${add(params.verification)}`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

// -------------------------------------------------------------- public feed
export const listPublicFeed = async (params = {}) => {
  const limit = clampLimit(params.limit);
  const sort = oneOf(params.sort, ["newest", "deadline", "relevance", "updated"], "newest");
  const { where, values } = buildFiltersSafe(params, { statusClause: "status = 'published'" });

  const cursor = decodeCursor(params.cursor);
  const orderSql = sort === "deadline"
    ? "application_deadline ASC NULLS LAST, id DESC"
    : sort === "updated"
      ? "updated_at DESC, id DESC"
      : "id DESC";

  let cursorClause = "";
  const finalValues = [...values];
  if (cursor?.id !== undefined) {
    if (sort === "deadline") {
      finalValues.push(cursor.deadline, cursor.id);
      cursorClause = `AND (application_deadline, id) > ($${finalValues.length - 1}, $${finalValues.length})`;
    } else if (sort === "updated") {
      finalValues.push(cursor.updatedAt, cursor.id);
      cursorClause = `AND (updated_at, id) < ($${finalValues.length - 1}, $${finalValues.length})`;
    } else {
      finalValues.push(cursor.id);
      cursorClause = `AND id < $${finalValues.length}`;
    }
  }

  const combinedWhere = where ? `${where} ${cursorClause}` : cursorClause ? `WHERE ${cursorClause.replace(/^AND /, "")}` : "";
  finalValues.push(limit + 1);
  const { rows } = await query(
    `SELECT * FROM opportunities ${combinedWhere} ORDER BY ${orderSql} LIMIT $${finalValues.length}`,
    finalValues,
  );

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor(
        sort === "deadline" ? { id: last.id, deadline: last.application_deadline }
        : sort === "updated" ? { id: last.id, updatedAt: last.updated_at }
        : { id: last.id },
      )
    : null;

  return { items: page.map((r) => serializeOpportunity(r)), hasMore, nextCursor };
};

export const getBySlug = async (slug, isAdmin = false) => {
  const { rows: [row] } = await query("SELECT * FROM opportunities WHERE slug = $1", [slug]);
  if (!row || (row.status !== "published" && !isAdmin)) throw new HttpError(404, "Opportunity not found");
  const { rows: related } = await query(
    `SELECT * FROM opportunities
      WHERE status = 'published' AND id <> $1
        AND (type = $2 OR company_name = $3)
      ORDER BY id DESC LIMIT 4`,
    [row.id, row.type, row.company_name],
  );
  return { ...serializeOpportunity(row, { isAdmin }), relatedOpportunities: related.map((r) => serializeOpportunity(r)) };
};

export const suggest = async (q) => {
  const text = cleanText(q, "Query", { min: 1, max: 100 });
  const { rows } = await query(
    `SELECT slug, title, company_name FROM opportunities
      WHERE status = 'published' AND (title ILIKE $1 OR company_name ILIKE $1)
      ORDER BY id DESC LIMIT 8`,
    [`%${text}%`],
  );
  return { items: rows.map((r) => ({ slug: r.slug, title: r.title, company: r.company_name })) };
};

// ------------------------------------------------------------- write shape
/** Shared field validation for both student-submit and admin create/update. `partial` skips required-field checks (PATCH-like PUT). */
const cleanOpportunityInput = (body = {}, { partial = false } = {}) => {
  const req = partial ? { optional: true } : {};
  return {
    title: cleanText(body.title, "Title", { min: 1, max: 200, ...req }),
    companyName: cleanText(body.company?.name, "Company name", { min: 1, max: 150, ...req }),
    companyLogoKey: body.company?.logoKey || null,
    type: partial && body.type === undefined ? undefined : oneOf(body.type, OPPORTUNITY_TYPES, null),
    shortDescription: cleanText(body.shortDescription ?? "", "Short description", { max: 300, optional: true }) ?? "",
    description: cleanText(body.description ?? "", "Description", { max: 20000, optional: true }) ?? "",
    eligibilityCriteria: cleanText(body.eligibility?.criteria ?? "", "Eligibility criteria", { max: 2000, optional: true }) ?? "",
    eligibilityBranches: cleanStringArray(body.eligibility?.branches, "Eligible branches", { upper: true }),
    eligibilityBatches: cleanStringArray(body.eligibility?.batches, "Eligible batches"),
    eligibilitySemesters: cleanStringArray(body.eligibility?.semesters, "Eligible semesters"),
    minCgpa: cleanNumber(body.eligibility?.minCgpa, "Minimum CGPA", { min: 0, max: 10 }),
    backlogsAllowed: cleanBool(body.eligibility?.backlogsAllowed, "Backlogs allowed", true),
    skillsRequired: cleanStringArray(body.skills?.required, "Required skills"),
    skillsPreferred: cleanStringArray(body.skills?.preferred, "Preferred skills"),
    locationText: cleanText(body.location?.text ?? "", "Location", { max: 200, optional: true }) ?? "",
    locationMode: oneOf(body.location?.mode, WORK_MODES, null),
    stipend: cleanNumber(body.compensation?.stipend, "Stipend", { min: 0 }),
    salary: cleanText(body.compensation?.salary ?? "", "Salary", { max: 100, optional: true }) || null,
    isPaid: cleanBool(body.compensation?.isPaid, "Paid", true),
    duration: cleanText(body.duration ?? "", "Duration", { max: 100, optional: true }) || null,
    applicationStartDate: cleanDate(body.applicationStartDate, "Application start date") || null,
    applicationDeadline: cleanDate(body.applicationDeadline, "Application deadline") || null,
    selectionProcess: cleanText(body.selectionProcess ?? "", "Selection process", { max: 5000, optional: true }) ?? "",
    openings: cleanNumber(body.openings, "Openings", { min: 1 }),
    applicationUrl: cleanText(body.links?.applicationUrl, "Official application URL", { min: 1, max: 2000, ...req }),
    companyUrl: cleanText(body.links?.companyUrl ?? "", "Company URL", { max: 2000, optional: true }) || null,
    sourceUrl: cleanText(body.links?.sourceUrl ?? "", "Source URL", { max: 2000, optional: true }) || null,
    contact: cleanText(body.contact ?? "", "Contact", { max: 500, optional: true }) || null,
    instructions: cleanText(body.instructions ?? "", "Instructions", { max: 2000, optional: true }) || null,
    attachments: cleanAttachments(body.attachments),
  };
};

const insertColumns = (input) => ({
  title: input.title,
  company_name: input.companyName,
  company_logo_key: input.companyLogoKey,
  type: input.type,
  short_description: input.shortDescription,
  description: input.description,
  eligibility_criteria: input.eligibilityCriteria,
  eligibility_branches: input.eligibilityBranches,
  eligibility_batches: input.eligibilityBatches,
  eligibility_semesters: input.eligibilitySemesters,
  min_cgpa: input.minCgpa ?? null,
  backlogs_allowed: input.backlogsAllowed,
  skills_required: input.skillsRequired,
  skills_preferred: input.skillsPreferred,
  location_text: input.locationText,
  location_mode: input.locationMode,
  stipend: input.stipend ?? null,
  salary: input.salary,
  is_paid: input.isPaid,
  duration: input.duration,
  application_start_date: input.applicationStartDate,
  application_deadline: input.applicationDeadline,
  selection_process: input.selectionProcess,
  openings: input.openings ?? null,
  application_url: input.applicationUrl,
  company_url: input.companyUrl,
  source_url: input.sourceUrl,
  contact: input.contact,
  instructions: input.instructions,
  attachments: JSON.stringify(input.attachments),
});

// ------------------------------------------------------------ student write
/** A student submits an opportunity: saved as a draft awaiting admin review (verification_status = 'pending'). */
export const submitOpportunity = async (userId, body) => {
  const input = cleanOpportunityInput(body);
  if (!input.type) throw new HttpError(400, "Opportunity type is required");
  const slug = await uniqueSlug(input.title, input.companyName);
  const cols = insertColumns(input);

  if (input.companyLogoKey) await verifyAndAttachUpload(userId, input.companyLogoKey, "opportunity-logo");

  const fields = Object.keys(cols);
  const placeholders = fields.map((_, i) => `$${i + 3}`);
  const { rows: [row] } = await query(
    `INSERT INTO opportunities (slug, submitted_by, ${fields.join(", ")})
     VALUES ($1, $2, ${placeholders.join(", ")}) RETURNING *`,
    [slug, userId, ...Object.values(cols)],
  );
  return serializeOpportunity(row);
};

// -------------------------------------------------------------- admin write
export const createAdmin = async (adminId, body) => {
  const input = cleanOpportunityInput(body);
  if (!input.type) throw new HttpError(400, "Opportunity type is required");
  const slug = await uniqueSlug(input.title, input.companyName);
  const cols = insertColumns(input);

  if (input.companyLogoKey) await verifyAndAttachUpload(adminId, input.companyLogoKey, "opportunity-logo");

  const fields = Object.keys(cols);
  const placeholders = fields.map((_, i) => `$${i + 3}`);
  // Admin-authored listings are auto-verified — an admin posting it directly
  // is itself the review step.
  const { rows: [row] } = await query(
    `INSERT INTO opportunities (slug, submitted_by, verification_status, verified_by, verified_at, ${fields.join(", ")})
     VALUES ($1, $2, 'verified', $2, now(), ${placeholders.join(", ")}) RETURNING *`,
    [slug, adminId, ...Object.values(cols)],
  );
  return serializeOpportunity(row, { isAdmin: true });
};

const loadForAdmin = async (id) => {
  const { rows: [row] } = await query("SELECT * FROM opportunities WHERE id = $1", [id]);
  if (!row) throw new HttpError(404, "Opportunity not found");
  return row;
};

export const getAdminById = async (id) => serializeOpportunity(await loadForAdmin(id), { isAdmin: true });

export const updateOpportunity = async (id, adminId, body) => {
  await loadForAdmin(id);
  const input = cleanOpportunityInput(body, { partial: true });
  const cols = insertColumns(input);
  const set = Object.keys(cols).filter((k) => cols[k] !== undefined);
  if (!set.length) throw new HttpError(400, "Nothing to update");

  if (input.companyLogoKey) await verifyAndAttachUpload(adminId, input.companyLogoKey, "opportunity-logo");

  const assignments = set.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows: [row] } = await query(
    `UPDATE opportunities SET ${assignments}, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, ...set.map((k) => cols[k])],
  );
  return serializeOpportunity(row, { isAdmin: true });
};

export const deleteOpportunity = async (id) => {
  const { rowCount } = await query("DELETE FROM opportunities WHERE id = $1", [id]);
  if (!rowCount) throw new HttpError(404, "Opportunity not found");
};

export const duplicateOpportunity = async (id, adminId) => {
  const row = await loadForAdmin(id);
  const slug = await uniqueSlug(`${row.title} copy`, row.company_name);
  const { rows: [copy] } = await query(
    `INSERT INTO opportunities (
       slug, submitted_by, title, company_name, company_logo_key, company_logo_url, type,
       short_description, description, eligibility_criteria, eligibility_branches, eligibility_batches,
       eligibility_semesters, min_cgpa, backlogs_allowed, skills_required, skills_preferred,
       location_text, location_mode, stipend, salary, is_paid, duration, application_start_date,
       application_deadline, selection_process, openings, application_url, company_url, source_url,
       contact, instructions, attachments, status, verification_status
     )
     SELECT $1, $2, title, company_name, company_logo_key, company_logo_url, type,
       short_description, description, eligibility_criteria, eligibility_branches, eligibility_batches,
       eligibility_semesters, min_cgpa, backlogs_allowed, skills_required, skills_preferred,
       location_text, location_mode, stipend, salary, is_paid, duration, application_start_date,
       application_deadline, selection_process, openings, application_url, company_url, source_url,
       contact, instructions, attachments, 'draft', 'verified'
     FROM opportunities WHERE id = $3 RETURNING *`,
    [slug, adminId, id],
  );
  return serializeOpportunity(copy, { isAdmin: true });
};

/** The "accept" action for a submitted opportunity — publishes it (or schedules it for later). */
export const publishOpportunity = async (id, adminId, scheduledAt) => {
  const row = await loadForAdmin(id);
  if (row.verification_status === "pending") {
    // Publishing a still-unreviewed submission implicitly verifies it — an
    // admin choosing "publish" IS the review decision.
    await query(
      "UPDATE opportunities SET verification_status = 'verified', verified_by = $2, verified_at = now() WHERE id = $1",
      [id, adminId],
    );
  }
  const at = cleanDate(scheduledAt, "Scheduled time");
  const { rows: [updated] } = at && new Date(at) > new Date()
    ? await query("UPDATE opportunities SET status = 'scheduled', scheduled_at = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, at])
    : await query("UPDATE opportunities SET status = 'published', scheduled_at = NULL, updated_at = now() WHERE id = $1 RETURNING *", [id]);
  return serializeOpportunity(updated, { isAdmin: true });
};

export const unpublishOpportunity = async (id) => {
  const { rows: [row] } = await query(
    "UPDATE opportunities SET status = 'draft', scheduled_at = NULL, updated_at = now() WHERE id = $1 RETURNING *",
    [id],
  );
  if (!row) throw new HttpError(404, "Opportunity not found");
  return serializeOpportunity(row, { isAdmin: true });
};

export const archiveOpportunity = async (id) => {
  const { rows: [row] } = await query(
    "UPDATE opportunities SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING *",
    [id],
  );
  if (!row) throw new HttpError(404, "Opportunity not found");
  return serializeOpportunity(row, { isAdmin: true });
};

/** The "reject" action for a submitted opportunity. */
export const rejectOpportunity = async (id, adminId, reason) => {
  const { rows: [row] } = await query(
    `UPDATE opportunities SET status = 'rejected', rejection_reason = $2, verified_by = $3, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, cleanText(reason ?? "", "Reason", { max: 500, optional: true }) || null, adminId],
  );
  if (!row) throw new HttpError(404, "Opportunity not found");
  return serializeOpportunity(row, { isAdmin: true });
};

export const setStatus = async (id, status) => {
  const clean = oneOf(status, STATUSES, null);
  if (!clean) throw new HttpError(400, "Invalid status");
  const { rows: [row] } = await query("UPDATE opportunities SET status = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, clean]);
  if (!row) throw new HttpError(404, "Opportunity not found");
  return serializeOpportunity(row, { isAdmin: true });
};

export const setFlags = async (id, { featured, urgent } = {}) => {
  const { rows: [row] } = await query(
    `UPDATE opportunities SET
       featured = COALESCE($2, featured),
       urgent = COALESCE($3, urgent),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, typeof featured === "boolean" ? featured : null, typeof urgent === "boolean" ? urgent : null],
  );
  if (!row) throw new HttpError(404, "Opportunity not found");
  return serializeOpportunity(row, { isAdmin: true });
};

export const verifyOpportunity = async (id, adminId, status) => {
  const clean = oneOf(status, VERIFICATION_STATUSES, null);
  if (!clean) throw new HttpError(400, "Invalid verification status");
  const { rows: [row] } = await query(
    `UPDATE opportunities SET
       verification_status = $2,
       verified_by = $3,
       verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END,
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, clean, adminId],
  );
  if (!row) throw new HttpError(404, "Opportunity not found");
  return serializeOpportunity(row, { isAdmin: true });
};

// -------------------------------------------------------------- admin list
export const listAdmin = async (params = {}) => {
  const limit = clampLimit(params.limit);
  // No statusClause here (unlike listPublicFeed) — admins see every status;
  // `params.status`/`params.verification` (handled inside buildFiltersSafe)
  // narrow that down when the caller asks for a specific one.
  const { where, values } = buildFiltersSafe(params);

  const cursor = decodeCursor(params.cursor);
  const finalValues = [...values];
  let cursorClause = "";
  if (cursor?.id !== undefined) {
    finalValues.push(cursor.id);
    cursorClause = `${where ? "AND" : "WHERE"} id < $${finalValues.length}`;
  }
  finalValues.push(limit + 1);

  const { rows } = await query(
    `SELECT * FROM opportunities ${where} ${cursorClause} ORDER BY id DESC LIMIT $${finalValues.length}`,
    finalValues,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => serializeOpportunity(r, { isAdmin: true })),
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
  };
};

// ----------------------------------------------------------------- stats
export const fetchStats = async () => {
  const { rows: [counts] } = await query(`
    SELECT
      count(*) FILTER (WHERE true) AS total,
      count(*) FILTER (WHERE status = 'published' AND (application_deadline IS NULL OR application_deadline > now())) AS active,
      count(*) FILTER (WHERE status = 'published' AND application_deadline IS NOT NULL
                        AND application_deadline > now() AND application_deadline <= now() + interval '3 days') AS expiring_soon,
      count(*) FILTER (WHERE status = 'draft' AND verification_status = 'pending') AS drafts,
      count(*) FILTER (WHERE status = 'scheduled') AS scheduled,
      count(*) FILTER (WHERE status = 'published' AND application_deadline IS NOT NULL AND application_deadline <= now()) AS closed
    FROM opportunities
  `);
  const { rows: mostViewed } = await query(
    "SELECT * FROM opportunities WHERE status = 'published' ORDER BY views DESC, id DESC LIMIT 5",
  );
  const { rows: mostClickedApply } = await query(
    "SELECT * FROM opportunities WHERE status = 'published' ORDER BY apply_clicks DESC, id DESC LIMIT 5",
  );
  return {
    total: counts.total,
    active: counts.active,
    expiringSoon: counts.expiring_soon,
    drafts: counts.drafts,
    scheduled: counts.scheduled,
    closed: counts.closed,
    mostViewed: mostViewed.map(serializeOpportunityBrief),
    mostBookmarked: [], // bookmarks aren't backed by a table yet
    mostClickedApply: mostClickedApply.map(serializeOpportunityBrief),
  };
};

// --------------------------------------------------------------- tracking
export const trackView = async (id) => {
  await query("UPDATE opportunities SET views = views + 1 WHERE id = $1 AND status = 'published'", [id]);
};

export const trackApplyClick = async (id) => {
  const { rows: [row] } = await query(
    "UPDATE opportunities SET apply_clicks = apply_clicks + 1 WHERE id = $1 AND status = 'published' RETURNING application_url",
    [id],
  );
  if (!row) throw new HttpError(404, "Opportunity not found");
  return { applicationUrl: row.application_url };
};

// --------------------------------------------------------- edit suggestions
const serializeSuggestion = (row) => ({
  id: String(row.id),
  opportunityId: String(row.opportunity_id),
  opportunity: row.opportunity_title
    ? { id: String(row.opportunity_id), title: row.opportunity_title, slug: row.opportunity_slug, company: { name: row.opportunity_company } }
    : undefined,
  note: row.note,
  status: row.status,
  createdAt: row.created_at,
});

export const suggestEdit = async (opportunityId, userId, body = {}) => {
  const note = cleanText(body.note, "Note", { min: 1, max: 500 });
  const { rowCount } = await query("SELECT 1 FROM opportunities WHERE id = $1", [opportunityId]);
  if (!rowCount) throw new HttpError(404, "Opportunity not found");
  const { rows: [row] } = await query(
    "INSERT INTO opportunity_edit_suggestions (opportunity_id, submitted_by, note) VALUES ($1, $2, $3) RETURNING *",
    [opportunityId, userId, note],
  );
  return serializeSuggestion(row);
};

export const listEditSuggestions = async (params = {}) => {
  const limit = clampLimit(params.limit);
  const status = oneOf(params.status, ["open", "resolved", "dismissed"], "open");
  const cursor = decodeCursor(params.cursor);
  const values = [status];
  let cursorClause = "";
  if (cursor?.id !== undefined) {
    values.push(cursor.id);
    cursorClause = `AND s.id < $${values.length}`;
  }
  values.push(limit + 1);

  const { rows } = await query(
    `SELECT s.*, o.title AS opportunity_title, o.slug AS opportunity_slug, o.company_name AS opportunity_company
       FROM opportunity_edit_suggestions s
       JOIN opportunities o ON o.id = s.opportunity_id
      WHERE s.status = $1 ${cursorClause}
      ORDER BY s.id DESC LIMIT $${values.length}`,
    values,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(serializeSuggestion),
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
  };
};

export const resolveEditSuggestion = async (id, adminId, action) => {
  const status = oneOf(action, ["resolved", "dismissed"], null);
  if (!status) throw new HttpError(400, "Invalid action");
  const { rows: [row] } = await query(
    "UPDATE opportunity_edit_suggestions SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1 RETURNING *",
    [id, status, adminId],
  );
  if (!row) throw new HttpError(404, "Suggestion not found");
  return serializeSuggestion(row);
};
