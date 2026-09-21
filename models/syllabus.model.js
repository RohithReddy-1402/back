import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    hours: Number,
    body: String,
    subsection: {
      title: String,
      body: String,
      hours: Number,
    },
  },
  { _id: false }
);

const syllabusSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    courseId: {
      type: String,
      required: true,
    },
    downloadCount:{
        type: Number,
        default: 0
    },
    // Catalog fields (from courses-info.json)
    route: String,
    branches: [String],
    // Not always a plain term number in the source data — e.g. "Odd/Even" or
    // "1st-6th (Continuous Evaluation)" for courses spanning semesters.
    semester: String,
    // Full unit-by-unit content (from course/<slug>.json) — absent for
    // courses that only exist as a catalog listing so far.
    credits: Number,
    prerequisites: String,
    courseType: String,
    ltpc: [Number],
    contactHours: Number,
    description: String,
    syllabus: [unitSchema],
    outcomes: [String],
    experiments: [String],
    textbooks: [String],
    referenceBooks: [String],
  },
  { timestamps: true }
);

const Syllabus = mongoose.model("Syllabus", syllabusSchema);

export default Syllabus;
