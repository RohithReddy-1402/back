// One-off fix for papers approved through /verifiedpaper/papers/:id before
// that route set migratedToR2. Those papers have a real r2Key (download
// works, proving the R2 object exists) but migratedToR2 stayed at its
// schema default of false, so /view/:fielId wrongly redirected to a
// fabricated legacy Appwrite URL instead of the R2 signed URL.
//
// Usage:
//   node scripts/backfillMigratedToR2.js            # dry run, lists matches
//   node scripts/backfillMigratedToR2.js --apply     # actually updates them

import "dotenv/config";
import mongoose from "mongoose";
import Paper from "../models/PaperSchema.js";

const apply = process.argv.includes("--apply");

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const filter = {
    r2Key: { $exists: true, $ne: null },
    migratedToR2: { $ne: true },
  };

  const affected = await Paper.find(filter, "paper_id title r2Key migratedToR2 r2ETag").lean();
  console.log(`Found ${affected.length} paper(s) with a real r2Key but migratedToR2 !== true:`);
  for (const p of affected) {
    console.log(`  - ${p.paper_id}  ${p.title}  r2Key=${p.r2Key}`);
  }

  if (!apply) {
    console.log("\nDry run only — no changes made. Re-run with --apply to fix these.");
    await mongoose.disconnect();
    return;
  }

  const result = await Paper.updateMany(filter, {
    $set: { migratedToR2: true, migratedAt: new Date() },
  });
  console.log(`\nUpdated ${result.modifiedCount} paper(s).`);

  await mongoose.disconnect();
  console.log("MongoDB disconnected");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
