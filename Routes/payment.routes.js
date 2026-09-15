import express from "express";
import authenticate from "../middleware/authenticate.js";
import requireAdmin from "../middleware/requireAdmin.js";
import {
  createOrder,
  verifyAndActivate,
  activateSubscription,
  verifyWebhookSignature,
  handleWebhookPayload
} from "../services/payment.service.js";
import User from "../models/UserSchema.js";

const router = express.Router();

router.post("/create-order", authenticate, async (req, res) => {
  try {
    const { plan } = req.body;
    const order = await createOrder({ userId: req.user.id, plan });
    res.status(200).json({ success: true, order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/verify", authenticate, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const { user } = await verifyAndActivate({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    res.status(200).json({ success: true, subscription: user.subscription });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// NOTE: the /webhook route is intentionally NOT defined here. Razorpay's
// webhook signature is computed over the raw request bytes, but this router
// is mounted after the app-level `express.json()` in server.js has already
// consumed the body stream. The webhook is instead registered directly in
// server.js (via `webhookHandler` below) ahead of `express.json()`, with its
// own `express.raw()` middleware.

router.post("/admin/users/:id/grant-premium", authenticate, requireAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    await activateSubscription(user, plan);
    res.status(200).json({ success: true, subscription: user.subscription });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/** Registered directly on `app` in server.js, ahead of `express.json()`. */
export const webhookHandler = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body; // Buffer, thanks to express.raw()
    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }
    const payload = JSON.parse(rawBody.toString("utf8"));
    await handleWebhookPayload(payload);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Razorpay webhook error:", err.message);
    res.status(500).json({ message: "Webhook processing failed" });
  }
};

export default router;
