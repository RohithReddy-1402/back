// Points system: contributions earn POINTS, not currency directly. Points are
// still redeemable for real money/plans at a fixed rate, so everything below
// is integer-exact — no float drift when a point is worth a fraction of a rupee.

export const BASE_REWARD_POINTS = 10; // per approved paper, before the rate multiplier
export const POINT_VALUE_PAISE = 10; // 1 point = ₹0.10

export const CASH_OPTIONS_RUPEES = [50, 100, 150, 200];

// Sanity caps on admin-entered numbers — generous, but not "type six extra zeros" generous.
export const MAX_BONUS_POINTS = 500; // a single bonus added at approval time
export const MAX_STANDALONE_BONUS_POINTS = 2000; // a bonus granted outside of an upload

/**
 * Why an admin might award bonus points on top of the flat base reward — purely
 * discretionary, nothing here is computed automatically. Shown to the admin as
 * a reason picker (approve dialog + standalone grant), and to the uploader next
 * to their bonus so they know why they got it.
 */
export const BONUS_REASONS = [
  { value: "recency", label: "Recent-year paper" },
  { value: "importance", label: "High importance / demand" },
  { value: "availability", label: "Hard to find elsewhere" },
  { value: "set_completion", label: "Completes a subject/semester set" },
  { value: "other", label: "Other" },
];

/**
 * Reward multiplier for a contributor. Currently flat ×1.
 * TODO: raise this with contribution volume (e.g. 1.1, 1.2) — `user.stats.approved`
 * is already maintained and available here for that logic.
 */
export const getRewardRate = (user) => 1;

export const rewardForPaper = (user) => {
  const rate = getRewardRate(user);
  return { rate, points: Math.round(BASE_REWARD_POINTS * rate) };
};

export const pointsToPaise = (points) => points * POINT_VALUE_PAISE;
export const paiseToPoints = (paise) => Math.round(paise / POINT_VALUE_PAISE);
