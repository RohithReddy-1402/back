import mongoose from "mongoose";

import User from "../models/UserSchema.js";
import Redemption from "../models/Redemption.js";
import RewardTransaction from "../models/RewardTransaction.js";
import {
  CASH_OPTIONS_RUPEES,
  POINT_VALUE_PAISE,
  MAX_STANDALONE_BONUS_POINTS,
  BONUS_REASONS,
  getRewardRate,
  paiseToPoints,
} from "../config/rewards.config.js";
import { getPlanPrices, activateSubscription } from "./payment.service.js";
import { paginate } from "./profile.service.js";
import { HttpError } from "./httpError.js";
import sendGiftPlanMail from "../components/giftPlanMail.js";

const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,31}$/;
const isDuplicateKey = (err) => err?.code === 11000;
const isBonusReason = (value) => BONUS_REASONS.some((r) => r.value === value);
const rupeesToPoints = (rupees) => paiseToPoints(rupees * 100);

// ------------------------------------------------------- points primitives ---

/**
 * Atomically takes `points` out of the balance. The `$gte` guard lives in the
 * filter, so two concurrent redeems can never push the balance negative.
 */
const deduct = async (userId, points) => {
  const updated = await User.findOneAndUpdate(
    { _id: userId, "points.balance": { $gte: points } },
    { $inc: { "points.balance": -points } },
    { new: true }
  ).select("points.balance");
  if (!updated) throw new HttpError(400, "Insufficient points balance");
  return updated.points.balance;
};

/**
 * Puts points back. The ledger row is inserted FIRST: its unique index on
 * (redemptionId, type=refund) means a second attempt fails before the balance
 * is touched, so a redemption can only ever be refunded once.
 */
const refund = async (userId, points, redemptionId) => {
  let tx;
  try {
    tx = await RewardTransaction.create({ userId, type: "refund", amount: points, redemptionId });
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
  const updated = await User.findByIdAndUpdate(userId, { $inc: { "points.balance": points } }, { new: true }).select(
    "points.balance"
  );
  await RewardTransaction.updateOne({ _id: tx._id }, { $set: { balanceAfter: updated?.points?.balance ?? null } });
  return true;
};

// ------------------------------------------------------------------ options ---

export const getOptions = async (userId) => {
  const user = await User.findById(userId).select("points stats subscription").lean();
  if (!user) throw new HttpError(404, "User not found");
  const plans = getPlanPrices(); // paise
  return {
    balance: user.points?.balance ?? 0,
    rewardRate: getRewardRate(user),
    pointValuePaise: POINT_VALUE_PAISE,
    cash: CASH_OPTIONS_RUPEES.map((rupees) => ({ rupees, points: rupeesToPoints(rupees) })),
    plans: Object.fromEntries(Object.entries(plans).map(([id, paise]) => [id, paiseToPoints(paise)])),
    subscription: user.subscription,
  };
};

// -------------------------------------------------------------- cash redeem ---

export const redeemCash = async (userId, { amount, upiId }) => {
  const rupees = Number(amount);
  if (!CASH_OPTIONS_RUPEES.includes(rupees)) throw new HttpError(400, "Invalid redeem amount");

  const upi = String(upiId ?? "").trim().toLowerCase();
  if (!UPI_RE.test(upi)) throw new HttpError(400, "Enter a valid UPI ID (e.g. name@okaxis)");

  const points = rupeesToPoints(rupees);
  // Building the doc first gives us its _id to tie the ledger/refund rows to.
  const redemption = new Redemption({ userId, type: "cash", amount: points, status: "pending", upiId: upi });

  const balance = await deduct(userId, points);
  try {
    await redemption.save();
    await RewardTransaction.create({
      userId, type: "redeem_cash", amount: -points, balanceAfter: balance, redemptionId: redemption._id,
    });
  } catch (err) {
    await Redemption.deleteOne({ _id: redemption._id }).catch(() => {});
    await refund(userId, points, redemption._id).catch((e) => console.error("Refund after failed cash redeem:", e));
    throw err;
  }

  return { redemption: redemption.toObject(), balance };
};

// -------------------------------------------------------------- plan redeem ---

const hasActiveLifetime = (user) =>
  user.subscription?.plan === "lifetime" && user.subscription?.status === "active";

const findRecipient = async (email) =>
  (await User.findOne({ EmailID: email })) || (await User.findOne({ EmailID: email.toLowerCase() }));

export const redeemPlan = async (userId, { plan, recipientEmail }) => {
  const priceInPaise = getPlanPrices()[plan];
  if (!priceInPaise) throw new HttpError(400, "Invalid plan");
  const cost = paiseToPoints(priceInPaise);

  const buyer = await User.findById(userId).select("name EmailID");
  if (!buyer) throw new HttpError(404, "User not found");

  const email = String(recipientEmail ?? "").trim() || buyer.EmailID;
  const isSelf = email.toLowerCase() === buyer.EmailID.toLowerCase();

  // Everything that can fail is checked BEFORE any points move.
  const recipient = isSelf ? await User.findById(userId) : await findRecipient(email);
  if (!recipient) {
    throw new HttpError(404, "No account exists for that email. Ask your friend to sign up first — nothing was deducted.");
  }
  if (hasActiveLifetime(recipient)) {
    throw new HttpError(400, isSelf ? "You already have a Lifetime plan." : "That user already has a Lifetime plan.");
  }

  const redemption = new Redemption({
    userId, type: "plan", amount: cost, status: "completed",
    plan, recipientUserId: recipient._id, recipientEmail: recipient.EmailID,
  });

  const balance = await deduct(userId, cost);

  try {
    await activateSubscription(recipient, plan, { stack: true });
  } catch (err) {
    await refund(userId, cost, redemption._id).catch((e) => console.error("Refund after failed plan grant:", e));
    throw err;
  }

  // The plan is already granted here, so a bookkeeping failure must not refund.
  try {
    await redemption.save();
    await RewardTransaction.create({
      userId, type: "redeem_plan", amount: -cost, balanceAfter: balance, redemptionId: redemption._id,
    });
  } catch (err) {
    console.error(`Plan ${plan} granted to ${recipient.EmailID} but bookkeeping failed:`, err);
  }

  if (!isSelf) {
    sendGiftPlanMail(recipient.EmailID, recipient.name, buyer.name, plan).catch((err) =>
      console.error("Gift plan mail failed:", err.message)
    );
  }

  return { balance, subscription: recipient.subscription, recipientEmail: recipient.EmailID, isSelf };
};

// ------------------------------------------------------------------ history ---

export const listRedemptions = (userId, query) =>
  paginate(Redemption, { userId }, {
    query,
    select: "type amount status upiId plan recipientEmail txnRef note createdAt processedAt",
  });

// ------------------------------------------------------------ admin payouts ---

const PAYOUT_STATUSES = ["pending", "paid", "rejected"];

const attachUsers = async (items) => {
  const ids = [...new Set(items.map((r) => String(r.userId)))];
  const users = await User.find({ _id: { $in: ids } }).select("name EmailID rollNumber").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return items.map((r) => {
    const u = byId.get(String(r.userId));
    return { ...r, user: u ? { name: u.name, email: u.EmailID, rollNumber: u.rollNumber || "" } : null };
  });
};

export const listPayouts = async (status, query) => {
  const wanted = PAYOUT_STATUSES.includes(status) ? status : "pending";
  const page = await paginate(Redemption, { type: "cash", status: wanted }, {
    query,
    select: "userId amount status upiId txnRef note createdAt processedAt",
  });
  page.items = await attachUsers(page.items);
  return page;
};

const assertObjectId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid payout id");
};

export const markPayoutPaid = async (id, adminId, txnRef) => {
  assertObjectId(id);
  const ref = String(txnRef ?? "").trim().slice(0, 100);
  const payout = await Redemption.findOneAndUpdate(
    { _id: id, type: "cash", status: "pending" },
    { $set: { status: "paid", txnRef: ref || null, processedBy: adminId, processedAt: new Date() } },
    { new: true }
  ).lean();
  if (!payout) throw new HttpError(409, "Payout was already processed");
  return payout;
};

export const rejectPayout = async (id, adminId, note) => {
  assertObjectId(id);
  const cleanNote = String(note ?? "").trim().slice(0, 300);
  // Flip pending → rejected atomically; if it is already rejected, fall through
  // so a previously failed refund can be retried (the refund itself is once-only).
  const payout =
    (await Redemption.findOneAndUpdate(
      { _id: id, type: "cash", status: "pending" },
      { $set: { status: "rejected", note: cleanNote || null, processedBy: adminId, processedAt: new Date() } },
      { new: true }
    ).lean()) || (await Redemption.findOne({ _id: id, type: "cash", status: "rejected" }).lean());
  if (!payout) throw new HttpError(409, "Payout was already processed");

  const refunded = await refund(payout.userId, payout.amount, payout._id);
  return { payout, refunded };
};

// ------------------------------------------------------- admin bonus grants ---

/**
 * A bonus that isn't tied to any specific upload — e.g. rewarding someone for
 * completing a full semester's set across several papers, entirely at the
 * admin's judgement. Always adds to the balance; there is no debit path here.
 */
export const grantBonus = async (adminId, { userEmail, points, reason, note }) => {
  const email = String(userEmail ?? "").trim();
  if (!email) throw new HttpError(400, "Enter the recipient's email");

  const amount = Math.round(Number(points));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_STANDALONE_BONUS_POINTS) {
    throw new HttpError(400, `Enter a bonus between 1 and ${MAX_STANDALONE_BONUS_POINTS} points`);
  }

  const user = await findRecipient(email);
  if (!user) throw new HttpError(404, "No account exists for that email");

  const cleanReason = isBonusReason(reason) ? reason : "other";
  const cleanNote = String(note ?? "").trim().slice(0, 300) || null;
  const reasonLabel = BONUS_REASONS.find((r) => r.value === cleanReason).label;

  const updated = await User.findByIdAndUpdate(
    user._id,
    { $inc: { "points.balance": amount, "points.lifetimeEarned": amount } },
    { new: true }
  ).select("points.balance name EmailID");

  await RewardTransaction.create({
    userId: user._id,
    type: "admin_bonus",
    amount,
    balanceAfter: updated.points.balance,
    note: cleanNote ? `${reasonLabel}: ${cleanNote}` : reasonLabel,
    grantedBy: adminId,
  });

  return { balance: updated.points.balance, user: { name: updated.name, email: updated.EmailID } };
};

export const listBonusGrants = async (query) => {
  const page = await paginate(RewardTransaction, { type: "admin_bonus" }, {
    query,
    select: "userId amount note createdAt",
  });
  page.items = await attachUsers(page.items);
  return page;
};
