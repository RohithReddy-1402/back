import mongoose from "mongoose";

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
    }
  },
  { timestamps: true }
);

const Syllabus = mongoose.model("Syllabus", syllabusSchema);

export default Syllabus;