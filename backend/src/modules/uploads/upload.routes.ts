import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { requireAuth } from "../../middleware/auth.js";
import { badRequest } from "../../lib/errors.js";
import { storeImage } from "../../lib/storage.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(badRequest("Only image files are accepted"));
    }
    cb(null, true);
  },
});

export const uploadRouter = Router();
uploadRouter.use(requireAuth);

uploadRouter.post("/", upload.array("photos", 6), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw badRequest("Attach at least one photo");

    const urls = await Promise.all(
      files.map(async (file) => {
        // Re-encoded server-side rather than trusting the upload as-is —
        // strips EXIF/GPS metadata a seller photo might carry, and a fixed
        // max dimension + JPEG quality keeps four photos well under any
        // request size that matters, regardless of what the phone shot or
        // which storage backend picks it up next.
        const resized = await sharp(file.buffer)
          .rotate()
          .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();

        return storeImage(resized);
      }),
    );

    res.status(201).json({ urls });
  } catch (err) {
    next(err);
  }
});
