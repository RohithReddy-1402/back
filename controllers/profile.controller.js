import * as profileService from "../services/profile.service.js";
import { respondWithError } from "../services/httpError.js";

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    respondWithError(res, error, "Profile error");
  }
};

export const getMe = wrap(async (req, res) => {
  res.status(200).json(await profileService.getProfile(req.user.id));
});

export const updateMe = wrap(async (req, res) => {
  res.status(200).json(await profileService.updateProfile(req.user.id, req.body));
});

export const getUploads = wrap(async (req, res) => {
  res.status(200).json(await profileService.listUploads(req.user.id, req.query));
});

export const getDownloads = wrap(async (req, res) => {
  res.status(200).json(await profileService.listDownloads(req.user.id, req.query));
});

export const getPayments = wrap(async (req, res) => {
  res.status(200).json(await profileService.listPayments(req.user.id, req.query));
});

export const avatarUploadUrl = wrap(async (req, res) => {
  res.status(200).json(await profileService.createAvatarUploadUrl(req.user.id, req.body || {}));
});

export const avatarConfirm = wrap(async (req, res) => {
  res.status(200).json(await profileService.confirmAvatar(req.user.id, req.body?.key));
});

export const avatarRemove = wrap(async (req, res) => {
  await profileService.removeAvatar(req.user.id);
  res.status(204).send();
});

/** Public: avatars are shown next to names, and the URL is an unguessable uuid. */
export const avatarGet = wrap(async (req, res) => {
  const object = await profileService.getAvatarObject(req.params.userId, req.params.file);
  res.set({
    "Content-Type": object.ContentType || "application/octet-stream",
    ...(object.ContentLength ? { "Content-Length": String(object.ContentLength) } : {}),
    "Cache-Control": "public, max-age=31536000, immutable",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  object.Body.on("error", () => res.destroy());
  object.Body.pipe(res);
});
