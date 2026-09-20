import crypto from "crypto";
import Razorpay from "razorpay";
import Payment from "../models/Payment.js";
import User from "../models/UserSchema.js";

// Lazily constructed — building this eagerly at import time would throw (and
// crash the whole server, not just this feature) whenever RAZORPAY_KEY_ID
// isn't set, e.g. before the env var is configured in a given environment.
let _razorpay = null;
const getRazorpay = () => {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return _razorpay;
};

// Prices are configured in whole rupees via env vars (PLAN_PRICE_*_INR) so
// they can be changed without a code deploy — Razorpay itself is charged in
// paise, so we convert here. Read live (not cached at module load) so a
// process restart is all that's needed to pick up a new value.
const rupeesToPaise = (rupees) => Math.round(Number(rupees) * 100);

export const getPlanPrices = () => ({
  monthly: rupeesToPaise(process.env.PLAN_PRICE_MONTHLY_INR ?? 1),
  yearly: rupeesToPaise(process.env.PLAN_PRICE_YEARLY_INR ?? 10),
  lifetime: rupeesToPaise(process.env.PLAN_PRICE_LIFETIME_INR ?? 25)
});

const PLAN_DURATION_MS = {
  monthly: 30 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000
};

export const createOrder = async ({ userId, plan }) => {
  const amount = getPlanPrices()[plan];
  if (!amount) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  const user = await User.findById(userId).select("name EmailID");
  if (!user) {
    throw new Error("User not found");
  }

  const order = await getRazorpay().orders.create({
    amount,
    currency: "INR",
    receipt: `user_${userId}_${Date.now()}`,
    notes: { userId, plan }
  });

  await Payment.create({
    userId,
    name: user.name,
    email: user.EmailID,
    razorpayOrderId: order.id,
    plan,
    amount,
    currency: "INR",
    status: "created"
  });

  return { orderId: order.id, amount, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID };
};

const PLAN_RANK = { monthly: 1, yearly: 2 };

/**
 * Shared by the client-verify flow, the admin manual-grant route and reward
 * redemption. Default behaviour replaces the subscription starting now.
 * With `{ stack: true }` (reward redemption) a new monthly/yearly period is
 * added on top of a still-active one, and never downgrades its plan label.
 */
export const activateSubscription = async (user, plan, { stack = false } = {}) => {
  const now = new Date();
  const duration = PLAN_DURATION_MS[plan];
  const current = user.subscription;
  const currentEnd = current?.expiresAt ? new Date(current.expiresAt) : null;
  const stacking = Boolean(
    stack && duration && current?.status === "active" && PLAN_RANK[current.plan] && currentEnd && currentEnd > now
  );

  user.subscription = {
    plan: stacking && PLAN_RANK[current.plan] > PLAN_RANK[plan] ? current.plan : plan,
    status: "active",
    startedAt: stacking ? current.startedAt : now,
    expiresAt: duration ? new Date((stacking ? currentEnd : now).getTime() + duration) : null
  };
  user.premium = true;
  await user.save();
  return user;
};

const verifySignature = (orderId, paymentId, signature) => {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
};

export const verifyAndActivate = async ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    throw new Error("Invalid payment signature");
  }

  const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
  if (!payment) {
    throw new Error("Order not found");
  }

  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.status = "paid";
  payment.verifiedAt = new Date();
  await payment.save();

  const user = await User.findById(payment.userId);
  if (!user) {
    throw new Error("User not found");
  }

  await activateSubscription(user, payment.plan);
  return { user, payment };
};

/** Verifies the raw-body webhook signature Razorpay sends server-to-server. */
export const verifyWebhookSignature = (rawBody, signature) => {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
};

/** Belt-and-braces activation path in case the client-side verify call never lands. */
export const handleWebhookPayload = async (payload) => {
  const orderId = payload?.payload?.payment?.entity?.order_id;
  if (!orderId) return;

  const payment = await Payment.findOne({ razorpayOrderId: orderId });
  if (!payment || payment.status === "paid") return;

  payment.razorpayPaymentId = payload.payload.payment.entity.id;
  payment.status = "paid";
  payment.verifiedAt = new Date();
  await payment.save();

  const user = await User.findById(payment.userId);
  if (!user) return;

  await activateSubscription(user, payment.plan);
};
