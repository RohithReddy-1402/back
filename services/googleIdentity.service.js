import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { HttpError } from "./httpError.js";

// Both lists are public identifiers (they ship inside the web bundle and the
// app), so defaults are safe; env vars let new clients be added without a deploy.
const listFromEnv = (name, fallback) =>
  (process.env[name] || fallback).split(",").map((s) => s.trim()).filter(Boolean);

const GOOGLE_CLIENT_IDS = listFromEnv(
  "GOOGLE_CLIENT_IDS",
  "339051675114-aaha2bnjsut4rat31u31c72rrl916elu.apps.googleusercontent.com",
);
const FIREBASE_PROJECT_IDS = listFromEnv(
  "FIREBASE_PROJECT_IDS",
  "nitkkrpreviouspapers-75bbd,project-x-64686",
);

const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

const client = new OAuth2Client();
let firebaseCerts = { certs: null, expiresAt: 0 };

const getFirebaseCerts = async () => {
  if (firebaseCerts.certs && Date.now() < firebaseCerts.expiresAt) return firebaseCerts.certs;
  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Firebase certs (${res.status})`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  firebaseCerts = { certs: await res.json(), expiresAt: Date.now() + maxAge * 1000 };
  return firebaseCerts.certs;
};

/**
 * Verifies a Google Identity Services credential or a Firebase ID token and
 * returns the proven `{ email, name }`. Throws HttpError(401) when the token
 * is missing, forged, expired, for another app, or has an unverified email.
 */
export const verifyGoogleCredential = async (credential) => {
  if (!credential || typeof credential !== "string") {
    throw new HttpError(401, "Google credential is required");
  }

  // Unverified decode is used only to pick which issuer's keys to verify with.
  const iss = jwt.decode(credential)?.iss || "";

  let payload;
  try {
    if (iss === "accounts.google.com" || iss === "https://accounts.google.com") {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_IDS });
      payload = ticket.getPayload();
    } else if (iss.startsWith("https://securetoken.google.com/")) {
      const ticket = await client.verifySignedJwtWithCertsAsync(
        credential,
        await getFirebaseCerts(),
        FIREBASE_PROJECT_IDS,
        FIREBASE_PROJECT_IDS.map((id) => `https://securetoken.google.com/${id}`),
      );
      payload = ticket.getPayload();
    }
  } catch (error) {
    console.error("Google credential verification failed:", error.message);
    throw new HttpError(401, "Invalid Google credential");
  }

  if (!payload) throw new HttpError(401, "Invalid Google credential");
  if (!payload.email || payload.email_verified !== true) {
    throw new HttpError(401, "Google account email is not verified");
  }
  return { email: payload.email, name: payload.name };
};
