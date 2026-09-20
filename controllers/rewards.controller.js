import * as rewardsService from "../services/rewards.service.js";
import { respondWithError } from "../services/httpError.js";

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    respondWithError(res, error, "Rewards error");
  }
};

export const getOptions = wrap(async (req, res) => {
  res.status(200).json(await rewardsService.getOptions(req.user.id));
});

export const redeemCash = wrap(async (req, res) => {
  const { amount, upiId } = req.body || {};
  res.status(201).json(await rewardsService.redeemCash(req.user.id, { amount, upiId }));
});

export const redeemPlan = wrap(async (req, res) => {
  const { plan, recipientEmail } = req.body || {};
  res.status(201).json(await rewardsService.redeemPlan(req.user.id, { plan, recipientEmail }));
});

export const listRedemptions = wrap(async (req, res) => {
  res.status(200).json(await rewardsService.listRedemptions(req.user.id, req.query));
});

export const listPayouts = wrap(async (req, res) => {
  res.status(200).json(await rewardsService.listPayouts(req.query.status, req.query));
});

export const markPayoutPaid = wrap(async (req, res) => {
  res.status(200).json(await rewardsService.markPayoutPaid(req.params.id, req.user.id, req.body?.txnRef));
});

export const rejectPayout = wrap(async (req, res) => {
  res.status(200).json(await rewardsService.rejectPayout(req.params.id, req.user.id, req.body?.note));
});

export const grantBonus = wrap(async (req, res) => {
  const { userEmail, points, reason, note } = req.body || {};
  res.status(201).json(await rewardsService.grantBonus(req.user.id, { userEmail, points, reason, note }));
});

export const listBonusGrants = wrap(async (req, res) => {
  res.status(200).json(await rewardsService.listBonusGrants(req.query));
});
