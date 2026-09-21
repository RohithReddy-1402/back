// One-off migration: upload the syllabus catalog + full course content
// (currently bundled as JSON in the sibling q_paper frontend repo) into the
// Syllabus collection, so the app can fetch it dynamically instead of
// bundling its own offline copies.
//
// Source: ../../q_paper/src/components/syllabus-data/{courses-info.json,course/*.json}
// Upserts by `id` (the catalog's id, e.g. "nitkkr_1") — matches how existing
// download-count documents are already keyed (see
// services/syllabus.service.js#updateDownloadCountById) and, unlike
// courseId/"Course Code", is guaranteed unique across the catalog.
//
// Usage:
//   node scripts/migrateSyllabus.js            # dry run, prints a summary
//   node scripts/migrateSyllabus.js --apply    # actually upserts

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Syllabus from "../models/syllabus.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYLLABUS_DATA_DIR = path.resolve(
  __dirname,
  "../../q_paper/src/components/syllabus-data",
);
const CATALOG_PATH = path.join(SYLLABUS_DATA_DIR, "courses-info.json");
const COURSE_DIR = path.join(SYLLABUS_DATA_DIR, "course");

const apply = process.argv.includes("--apply");

function loadCourseDetail(route) {
  if (!route) return null;
  const slug = route.replace(/^course\//, "");
  const filePath = path.join(COURSE_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildDoc(entry, detail) {
  return {
    id: entry.id,
    title: entry["Course Title"] ?? detail?.["Course Title"],
    courseId: entry["Course Code"] ?? detail?.["Course Code"],
    route: entry.route,
    branches: entry.Branches ?? detail?.Branch ?? [],
    semester: entry.semester ?? detail?.semester,
    credits: detail?.credits,
    prerequisites: detail?.prerequisites,
    courseType: detail?.["Course Type"],
    ltpc: detail?.ltpc,
    contactHours: detail?.contactHours,
    description: detail?.description,
    syllabus: detail?.syllabus,
    outcomes: detail?.outcomes,
    experiments: detail?.experiments,
    textbooks: detail?.textbooks,
    referenceBooks: detail?.referenceBooks,
  };
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog not found at ${CATALOG_PATH}`);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  console.log(`Loaded ${catalog.length} catalog entries from ${CATALOG_PATH}`);

  const docs = catalog.map((entry) => {
    const detail = loadCourseDetail(entry.route);
    return { doc: buildDoc(entry, detail), hasContent: !!detail };
  });

  const withContent = docs.filter((d) => d.hasContent).length;
  console.log(
    `${withContent} course(s) have full unit-by-unit content, ${docs.length - withContent} are catalog-only.`,
  );

  if (!apply) {
    console.log("\nDry run only — no changes made. Re-run with --apply to write these.");
    console.log("Sample document:", JSON.stringify(docs[0].doc, null, 2));
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  let created = 0;
  let updated = 0;
  for (const { doc } of docs) {
    const result = await Syllabus.findOneAndUpdate(
      { id: doc.id },
      { $set: doc, $setOnInsert: { downloadCount: 0 } },
      { upsert: true, new: true, rawResult: true },
    );
    if (result.lastErrorObject?.upserted) created += 1;
    else updated += 1;
  }

  console.log(`\nDone. Created ${created}, updated ${updated}, total ${created + updated}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
