import "dotenv/config";
import mongoose from "mongoose";
import Paper from "../models/PaperSchema.js";
import { watermarkAndSwap } from "../services/paperWatermarkPipeline.service.js";
import { invalidatePapersCache } from "../services/papersCache.service.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const rewatermark = args.includes("--rewatermark");
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};
const limit = Number(flag("limit")) || Infinity;
const concurrency = Math.max(1, Number(flag("concurrency")) || 3);
const onlyPaperId = flag("paper-id");

async function runPool(items, size, worker) {
  let i = 0;
  const results = [];
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));
  return results;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const filter = {
    migratedToR2: true,
    watermarked: rewatermark ? true : { $ne: true },
    r2Key: { $exists: true, $ne: null },
    ...(onlyPaperId ? { paper_id: onlyPaperId } : {}),
  };

  let papers = await Paper.find(filter, "_id paper_id title r2Key").sort({ _id: 1 }).lean();
  if (Number.isFinite(limit)) papers = papers.slice(0, limit);

  console.log(
    `Found ${papers.length} paper(s) to ${apply ? (rewatermark ? "re-watermark (second pass)" : "watermark") : "dry-run"}.`
  );
  if (!papers.length) {
    await mongoose.disconnect();
    return;
  }

  let applied = 0;
  let failed = 0;
  let skipped = 0;

  await runPool(papers, concurrency, async (paper) => {
    try {
      const result = await watermarkAndSwap(paper, { dryRun: !apply });
      if (result.dryRun) {
        console.log(`[dry-run] ${paper.paper_id}  ${paper.title}  ${result.sourceKey} -> ${result.targetKey}`);
      } else if (result.applied) {
        applied++;
        console.log(`[ok]      ${paper.paper_id}  ${paper.title}  ${result.sourceKey} -> ${result.targetKey}`);
      } else {
        skipped++;
        console.log(`[skip]    ${paper.paper_id}  ${result.reason}`);
      }
    } catch (err) {
      failed++;
      console.error(`[FAILED]  ${paper.paper_id}  ${paper.title}:`, err.message);
    }
  });

  if (apply && applied > 0) {
    await invalidatePapersCache();
  }

  console.log(`\nDone. applied=${applied} skipped=${skipped} failed=${failed} total=${papers.length}`);
  if (!apply) console.log("Dry run only — no changes made. Re-run with --apply to actually watermark these.");

  await mongoose.disconnect();
  console.log("MongoDB disconnected");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Watermark migration failed:", err);
  process.exit(1);
});
