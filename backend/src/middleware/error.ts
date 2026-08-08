import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}` },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Field-level validation failures. Safe to return, they describe the request
  // the client just sent, not anything about our internals.
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "validation_failed",
        message: "Check the highlighted fields and try again",
        fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err, path: req.path }, err.message);
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 is a unique constraint. Never echo back which value collided on
    // auth routes, that turns signup into an account enumeration oracle.
    if (err.code === "P2002") {
      return res.status(409).json({
        error: { code: "conflict", message: "That record already exists" },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        error: { code: "not_found", message: "That record could not be found" },
      });
    }
  }

  logger.error({ err, path: req.path, method: req.method }, "unhandled error");

  res.status(500).json({
    error: {
      code: "server_error",
      message: "Something went wrong on our end. Try again in a moment.",
      ...(env.isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}
