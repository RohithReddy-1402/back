import PendingPaperMail from "../models/PendingPaperMail.js";
import sendApprovedDigest from "../components/paperApprovedMail.js";

const IDLE_MINUTES = Number(process.env.PAPER_MAIL_IDLE_MINUTES || 30);
const MAX_HOURS = Number(process.env.PAPER_MAIL_MAX_HOURS || 24);
const SWEEP_INTERVAL_MS = Number(process.env.PAPER_MAIL_SWEEP_MINUTES || 5) * 60 * 1000;

export const queuePaperApproval = async ({ mail, name, paper }) => {
  const now = new Date();
  await PendingPaperMail.findOneAndUpdate(
    { mail },
    {
      $setOnInsert: { firstAddedAt: now },
      $set: { name, lastAddedAt: now },
      $push: { papers: { ...paper, approvedAt: now } },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const isDue = (doc, now) => {
  const idleMs = now - doc.lastAddedAt;
  const totalMs = now - doc.firstAddedAt;
  return idleMs >= IDLE_MINUTES * 60000 || totalMs >= MAX_HOURS * 3600000;
};

export const flushDuePaperMails = async () => {
  const now = new Date();
  const pending = await PendingPaperMail.find();

  for (const doc of pending) {
    if (!isDue(doc, now)) continue;

    try {
      await sendApprovedDigest(doc.mail, doc.name, doc.papers);
      await PendingPaperMail.deleteOne({ _id: doc._id });
      console.log(`Approval digest sent to ${doc.mail} (${doc.papers.length} paper(s))`);
    } catch (err) {
      console.error(`Failed to send approval digest to ${doc.mail}:`, err.message);
    }
  }
};

export const startPaperMailScheduler = () => {
  setInterval(() => {
    flushDuePaperMails().catch((err) => console.error("Paper mail sweep failed:", err.message));
  }, SWEEP_INTERVAL_MS);
  console.log(`Paper approval mail scheduler started (idle=${IDLE_MINUTES}m, max=${MAX_HOURS}h, sweep every ${SWEEP_INTERVAL_MS / 60000}m)`);
};
