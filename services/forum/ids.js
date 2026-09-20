import { HttpError } from "../httpError.js";

// Public ids are base36 (e.g. post 1000000 → "lfls"), like Reddit's short ids.
export const toId36 = (id) => Number(id).toString(36);

export const fromId36 = (raw, label = "Not found") => {
  if (typeof raw !== "string" || !/^[0-9a-z]{1,10}$/.test(raw)) throw new HttpError(404, label);
  return parseInt(raw, 36);
};
