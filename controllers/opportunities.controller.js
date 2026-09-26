import * as opportunities from "../services/opportunities/opportunity.service.js";
import * as uploads from "../services/opportunities/upload.service.js";
import { respondWithError } from "../services/httpError.js";

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    respondWithError(res, error, "Opportunities error");
  }
};

// ------------------------------------------------------------------ feed
export const feed = wrap(async (req, res) => {
  res.status(200).json(await opportunities.listPublicFeed(req.query));
});

// Neither bookmarks nor a recommendation engine are backed by a table/model
// yet — both return an honest empty page rather than a 404/500, so the
// frontend's "Saved"/"Recommended" tabs show an empty state instead of an
// error. Fill these in once those tables exist.
export const recommendedFeed = wrap(async (req, res) => {
  res.status(200).json({ items: [], hasMore: false, nextCursor: null });
});

export const bookmarksFeed = wrap(async (req, res) => {
  res.status(200).json({ items: [], hasMore: false, nextCursor: null });
});

export const companyFeed = wrap(async (req, res) => {
  res.status(200).json(await opportunities.listPublicFeed({ ...req.query, company: req.params.name }));
});

export const getOpportunity = wrap(async (req, res) => {
  res.status(200).json(await opportunities.getBySlug(req.params.slug, req.user?.role === "admin"));
});

export const suggest = wrap(async (req, res) => {
  res.status(200).json(await opportunities.suggest(req.query.q));
});

// --------------------------------------------------------------- tracking
export const trackView = wrap(async (req, res) => {
  await opportunities.trackView(req.params.id);
  res.status(204).send();
});

export const trackApplyClick = wrap(async (req, res) => {
  res.status(200).json(await opportunities.trackApplyClick(req.params.id));
});

// ------------------------------------------------------------------ uploads
export const presignUpload = wrap(async (req, res) => {
  res.status(200).json(await uploads.createPresignedUpload(req.user.id, req.body));
});

// -------------------------------------------------------- student submission
// The "let students post one for review" flow: this is a public write, so it
// lives outside /admin, but still needs `authenticate` — see routes file.
export const submit = wrap(async (req, res) => {
  res.status(201).json(await opportunities.submitOpportunity(req.user.id, req.body));
});

// ------------------------------------------------------------------- admin
export const adminList = wrap(async (req, res) => {
  res.status(200).json(await opportunities.listAdmin(req.query));
});

export const adminGet = wrap(async (req, res) => {
  res.status(200).json(await opportunities.getAdminById(req.params.id));
});

export const adminCreate = wrap(async (req, res) => {
  res.status(201).json(await opportunities.createAdmin(req.user.id, req.body));
});

export const adminUpdate = wrap(async (req, res) => {
  res.status(200).json(await opportunities.updateOpportunity(req.params.id, req.user.id, req.body));
});

export const adminDelete = wrap(async (req, res) => {
  await opportunities.deleteOpportunity(req.params.id);
  res.status(204).send();
});

export const adminDuplicate = wrap(async (req, res) => {
  res.status(201).json(await opportunities.duplicateOpportunity(req.params.id, req.user.id));
});

// This is the "I accept that" action — publishing a pending submission is
// itself the review decision (see opportunity.service.js#publishOpportunity).
export const adminPublish = wrap(async (req, res) => {
  res.status(200).json(await opportunities.publishOpportunity(req.params.id, req.user.id, req.body?.scheduledAt));
});

export const adminUnpublish = wrap(async (req, res) => {
  res.status(200).json(await opportunities.unpublishOpportunity(req.params.id));
});

export const adminArchive = wrap(async (req, res) => {
  res.status(200).json(await opportunities.archiveOpportunity(req.params.id));
});

export const adminReject = wrap(async (req, res) => {
  res.status(200).json(await opportunities.rejectOpportunity(req.params.id, req.user.id, req.body?.reason));
});

export const adminSetStatus = wrap(async (req, res) => {
  res.status(200).json(await opportunities.setStatus(req.params.id, req.body?.status));
});

export const adminSetFlags = wrap(async (req, res) => {
  res.status(200).json(await opportunities.setFlags(req.params.id, req.body));
});

export const adminVerify = wrap(async (req, res) => {
  res.status(200).json(await opportunities.verifyOpportunity(req.params.id, req.user.id, req.body?.status));
});

// No audit-log table exists yet — an empty list keeps the moderation
// screen's "Verification log" section from erroring, until one is built.
export const adminVerificationLog = wrap(async (req, res) => {
  res.status(200).json({ items: [] });
});

// Reports aren't backed by a table yet either (see feed.js note above).
export const adminReports = wrap(async (req, res) => {
  res.status(200).json({ items: [], hasMore: false, nextCursor: null });
});

export const adminResolveReport = wrap(async (req, res) => {
  res.status(404).json({ message: "Reporting isn't wired up yet" });
});

export const adminStats = wrap(async (req, res) => {
  res.status(200).json(await opportunities.fetchStats());
});
