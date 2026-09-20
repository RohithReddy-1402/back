import Contribution from "../models/Contribution.js";
import RewardTransaction from "../models/RewardTransaction.js";
import User from "../models/UserSchema.js";
import { rewardForPaper, MAX_BONUS_POINTS, BONUS_REASONS } from "../config/rewards.config.js";

export const REJECT_REASONS = ["duplicate", "fake", "low_quality", "other"];

const isDuplicateKey = (err) => err?.code === 11000;
const isBonusReason = (value) => BONUS_REASONS.some((r) => r.value === value);

const cleanBonus = (bonusPoints, bonusReason, bonusNote) => {
  const points = Math.max(0, Math.min(MAX_BONUS_POINTS, Math.round(Number(bonusPoints) || 0)));
  if (points <= 0) return { points: 0, reason: null, note: null };
  return {
    points,
    reason: isBonusReason(bonusReason) ? bonusReason : "other",
    note: String(bonusNote ?? "").trim().slice(0, 300) || null,
  };
};

/** Called from POST /upload right after the pending `verifypaper` doc is saved. */
export const createContribution = async ({ userId, name, mail, r2Key, title, subject, subjectCode, sem, year, examType }) => {
  try {
    await Contribution.create({ userId, name, mail, r2Key, title, subject, subjectCode, sem, year, examType });
  } catch (err) {
    if (isDuplicateKey(err)) return; // client retried the same upload
    throw err;
  }
  await User.updateOne({ _id: userId }, { $inc: { "stats.uploads": 1 } });
};

/**
 * Papers uploaded before contributions were tracked have no Contribution doc
 * and no userId, only the (previously unauthenticated) `mail` on the pending
 * doc — so that is the only way to find their owner.
 */
const findLegacyOwner = async (pendingDoc) => {
  if (pendingDoc?.userId) return User.findById(pendingDoc.userId).select("_id name EmailID");
  if (pendingDoc?.mail) return User.findOne({ EmailID: pendingDoc.mail }).select("_id name EmailID");
  return null;
};

const createLegacyContribution = async ({ owner, r2Key, pendingDoc, meta, status, extra }) => {
  try {
    const doc = await Contribution.create({
      userId: owner._id,
      name: pendingDoc?.name || owner.name,
      mail: pendingDoc?.mail || owner.EmailID,
      r2Key,
      title: meta?.title ?? pendingDoc?.title,
      subject: meta?.subject ?? pendingDoc?.subject,
      subjectCode: meta?.subjectCode ?? pendingDoc?.subjectCode,
      sem: meta?.sem ?? pendingDoc?.sem,
      year: meta?.year ?? pendingDoc?.year,
      examType: meta?.examType ?? pendingDoc?.examType,
      status,
      ...extra,
    });
    await User.updateOne({ _id: owner._id }, { $inc: { "stats.uploads": 1 } });
    return doc;
  } catch (err) {
    if (isDuplicateKey(err)) return null; // someone else got there first
    throw err;
  }
};

/**
 * Marks the contribution approved and credits the reward — exactly once. The
 * `pending → approved` transition is a single atomic update, so a second
 * approve (double click, retry) matches nothing and pays nothing.
 *
 * `bonusPoints`/`bonusReason`/`bonusNote` are the admin's discretionary top-up
 * for this specific paper (recency, importance, completing a set, ...) — never
 * computed automatically. Returns the total points paid, or 0 if nothing was.
 */
export const approveContribution = async ({ r2Key, meta, adminId, pendingDoc, bonusPoints, bonusReason, bonusNote }) => {
  const reviewedAt = new Date();
  const base = { status: "approved", reviewedBy: adminId, reviewedAt };
  const bonus = cleanBonus(bonusPoints, bonusReason, bonusNote);

  let contribution = await Contribution.findOneAndUpdate(
    { r2Key, status: "pending" },
    { $set: { ...base, ...(meta || {}) } },
    { new: true }
  );

  if (!contribution) {
    if (await Contribution.exists({ r2Key })) return 0; // already approved / rejected
    const owner = await findLegacyOwner(pendingDoc);
    if (!owner) return 0;
    contribution = await createLegacyContribution({
      owner, r2Key, pendingDoc, meta, status: "approved", extra: { reviewedBy: adminId, reviewedAt },
    });
    if (!contribution) return 0;
  }

  const owner = await User.findById(contribution.userId).select("stats");
  if (!owner) return 0;

  const { rate, points: basePoints } = rewardForPaper(owner);
  const total = basePoints + bonus.points;
  const updated = await User.findByIdAndUpdate(
    contribution.userId,
    { $inc: { "points.balance": total, "points.lifetimeEarned": total, "stats.approved": 1 } },
    { new: true }
  ).select("points.balance");

  const bonusLabel = bonus.points > 0 ? BONUS_REASONS.find((r) => r.value === bonus.reason)?.label : null;

  await Promise.all([
    RewardTransaction.create({
      userId: contribution.userId,
      type: "paper_reward",
      amount: total,
      balanceAfter: updated?.points?.balance ?? null,
      contributionId: contribution._id,
      note: bonusLabel ? `+${bonus.points} bonus — ${bonusLabel}${bonus.note ? `: ${bonus.note}` : ""}` : null,
    }),
    Contribution.updateOne(
      { _id: contribution._id },
      { $set: { rewardPoints: basePoints, rewardRate: rate, bonusPoints: bonus.points, bonusReason: bonus.reason, bonusNote: bonus.note } }
    ),
  ]);

  return total;
};

export const rejectContribution = async ({ r2Key, reason, note, adminId, pendingDoc }) => {
  const rejectReason = REJECT_REASONS.includes(reason) ? reason : "other";
  const rejectNote = String(note ?? "").trim().slice(0, 300) || null;
  const reviewedAt = new Date();

  let contribution = await Contribution.findOneAndUpdate(
    { r2Key, status: "pending" },
    { $set: { status: "rejected", rejectReason, rejectNote, reviewedBy: adminId, reviewedAt } },
    { new: true }
  );

  if (!contribution) {
    if (await Contribution.exists({ r2Key })) return;
    const owner = await findLegacyOwner(pendingDoc);
    if (!owner) return;
    contribution = await createLegacyContribution({
      owner, r2Key, pendingDoc, status: "rejected",
      extra: { rejectReason, rejectNote, reviewedBy: adminId, reviewedAt },
    });
    if (!contribution) return;
  }

  await User.updateOne({ _id: contribution.userId }, { $inc: { "stats.rejected": 1 } });
};
