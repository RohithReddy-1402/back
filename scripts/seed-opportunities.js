// One-off: seeds the Microsoft SWE Intern opportunity the user asked to add.
// Run with: node scripts/seed-opportunities.js
//
// Marked verification_status: 'under_review' rather than 'verified' — the
// live "Apply" button state couldn't be confirmed (Microsoft's careers
// portal is a JS-rendered SPA a script can't execute), only that the
// listing exists and is framed as "open until filled". An admin should
// click through and flip it to Verified from the moderation screen once
// they've confirmed it themselves — same trust rule as everything else in
// this feature: never claim "Verified" unless someone actually checked.
import "dotenv/config";
import mongoose from "mongoose";
import pool from "../config/pg.js";
import { createAdmin } from "../services/opportunities/opportunity.service.js";
import { query } from "../config/pg.js";

async function findAnAdminId() {
  const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }), "users");
  const admin = await User.findOne({ role: "admin" }).select("_id").lean();
  if (!admin) throw new Error("No user with role 'admin' found — can't attribute the seeded post to anyone.");
  return String(admin._id);
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const adminId = await findAnAdminId();
  console.log(`Attributing seeded opportunity to admin user ${adminId}`);

  const opportunity = await createAdmin(adminId, {
    title: "Software Engineering Intern",
    company: { name: "Microsoft" },
    type: "internship",
    shortDescription: "Undergraduate Software Engineering Internship across Microsoft's India offices.",
    description:
      "Work alongside experienced engineers on real Microsoft products, with exposure to the company's " +
      "broader technology ecosystem and its approach to innovation, collaboration and product development. " +
      "Fully on-site.",
    eligibility: {
      criteria: "Open to undergraduate students. Confirm exact eligibility on the official listing.",
      branches: [],
      batches: [],
      semesters: [],
      backlogsAllowed: true,
    },
    skills: { required: [], preferred: [] },
    location: { text: "India (multiple locations)", mode: "onsite" },
    compensation: { isPaid: true },
    links: {
      applicationUrl: "https://apply.careers.microsoft.com/careers?query=200041085&start=0&pid=1970393556911730&sort_by=relevance",
      companyUrl: "https://careers.microsoft.com/",
      sourceUrl: "https://apply.careers.microsoft.com/careers?query=200041085&start=0&pid=1970393556911730&sort_by=relevance",
    },
    instructions:
      "Job ID 200041085. Listed as posted July 1, 2026 and open until filled, per Microsoft's own listing — " +
      "no hard deadline found. Verify the live application status directly on the official listing before applying.",
  });

  // createAdmin() auto-verifies admin-authored posts; override that here
  // since this one specifically couldn't be click-confirmed as live.
  await query(
    "UPDATE opportunities SET verification_status = 'under_review', status = 'published' WHERE id = $1",
    [opportunity.id],
  );

  console.log("Seeded opportunity:", { id: opportunity.id, slug: opportunity.slug, title: opportunity.title });
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
    await pool.end().catch(() => {});
  });
