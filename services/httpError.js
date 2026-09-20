export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Shared controller error responder: HttpError → its status, anything else → 500. */
export const respondWithError = (res, error, label = "Error") => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(`${label}:`, error);
  return res.status(500).json({ message: "Server error" });
};
