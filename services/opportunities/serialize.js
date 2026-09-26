// Row → API shape, matching what the frontend's src/services/opportunities.js
// (OpportunityError, presign contract, etc.) already expects. `isAdmin` reveals
// fields students never need (upload keys, submitter id, internal stats).

const ASSET_BASE = () => (process.env.OPPORTUNITIES_ASSET_BASE_URL || process.env.FORUM_IMG_BASE_URL || "").replace(/\/$/, "");

export const assetUrl = (key) => (key ? `${ASSET_BASE()}/${key}` : null);

export const serializeOpportunity = (row, { isAdmin = false } = {}) => ({
  id: String(row.id),
  slug: row.slug,
  title: row.title,
  company: {
    name: row.company_name,
    logoUrl: row.company_logo_url || assetUrl(row.company_logo_key),
    ...(isAdmin ? { logoKey: row.company_logo_key } : {}),
  },
  type: row.type,
  shortDescription: row.short_description,
  description: row.description,
  eligibility: {
    criteria: row.eligibility_criteria,
    branches: row.eligibility_branches || [],
    batches: row.eligibility_batches || [],
    semesters: row.eligibility_semesters || [],
    minCgpa: row.min_cgpa != null ? Number(row.min_cgpa) : null,
    backlogsAllowed: row.backlogs_allowed,
  },
  skills: {
    required: row.skills_required || [],
    preferred: row.skills_preferred || [],
  },
  location: { text: row.location_text, mode: row.location_mode },
  compensation: {
    stipend: row.stipend != null ? Number(row.stipend) : null,
    salary: row.salary,
    isPaid: row.is_paid,
  },
  duration: row.duration,
  applicationStartDate: row.application_start_date,
  applicationDeadline: row.application_deadline,
  selectionProcess: row.selection_process,
  openings: row.openings,
  links: {
    applicationUrl: row.application_url,
    companyUrl: row.company_url,
    sourceUrl: row.source_url,
  },
  contact: row.contact,
  instructions: row.instructions,
  attachments: (row.attachments || []).map((a) => (a.url?.startsWith("http") ? a : { ...a, url: assetUrl(a.key ?? a.url) })),
  status: row.status,
  featured: row.featured,
  urgent: row.urgent,
  scheduledAt: row.scheduled_at,
  verification: {
    status: row.verification_status,
    source: row.source_url || null,
    ...(isAdmin ? { verifiedBy: row.verified_by, submittedBy: row.submitted_by } : {}),
    verifiedAt: row.verified_at,
  },
  ...(isAdmin ? { rejectionReason: row.rejection_reason } : {}),
  datePosted: row.created_at,
  lastUpdated: row.updated_at,
  ...(isAdmin ? { stats: { views: row.views, bookmarks: row.bookmark_count, applyClicks: row.apply_clicks } } : {}),
});

export const serializeOpportunityBrief = (row) => ({
  id: String(row.id),
  slug: row.slug,
  title: row.title,
  company: { name: row.company_name, logoUrl: row.company_logo_url || assetUrl(row.company_logo_key) },
  type: row.type,
  applicationDeadline: row.application_deadline,
  status: row.status,
  views: row.views,
  bookmarkCount: row.bookmark_count,
  applyClicks: row.apply_clicks,
});
