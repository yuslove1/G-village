import { v2 as cloudinary } from "cloudinary";
import path from "node:path";
import fs from "node:fs/promises";
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const uploadsDir = path.resolve(process.cwd(), "uploads");

/**
 * Storage target switches on whether CLOUDINARY_URL is set in the
 * environment — nothing else in this file, or in upload.routes.ts, needs
 * to change to move off local disk. cloudinary.config() called with no
 * arguments reads CLOUDINARY_URL itself (the single connection string
 * Cloudinary's own dashboard hands you, shaped like
 * cloudinary://<key>:<secret>@<cloud_name>), so there is nothing here to
 * parse by hand — just add the var and restart.
 */
const useCloudinary = Boolean(env.CLOUDINARY_URL);

if (useCloudinary) {
  cloudinary.config({ secure: true });
  logger.info("photo storage: Cloudinary");
} else {
  logger.info({ uploadsDir }, "photo storage: local disk (set CLOUDINARY_URL to switch)");
}

/** Takes an already-processed image buffer and returns its public URL. */
export async function storeImage(buffer: Buffer): Promise<string> {
  return useCloudinary ? uploadToCloudinary(buffer) : uploadToDisk(buffer);
}

function uploadToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "gadgetvillage", resource_type: "image" },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload returned nothing"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

async function uploadToDisk(buffer: Buffer): Promise<string> {
  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${nanoid(16)}.jpg`;
  await fs.writeFile(path.join(uploadsDir, filename), buffer);
  return `${env.API_URL}/uploads/${filename}`;
}
