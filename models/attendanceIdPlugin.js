// Shared across the attendance models so every response exposes a plain
// `id` string instead of Mongoose's `_id`/`__v`, matching what the app's
// frontend (and the REST contract it was built against) expects.
export default function attendanceIdPlugin(schema) {
  schema.set("toJSON", {
    virtuals: true,
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });
}
