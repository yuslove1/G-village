/**
 * Errors the API is willing to describe to a client. Anything not in this
 * shape becomes a generic 500, because an unexpected stack trace is a map of
 * the codebase and there is no reason to hand one out.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, "bad_request", msg, details);

export const unauthorized = (msg = "Sign in to continue") =>
  new AppError(401, "unauthorized", msg);

export const forbidden = (msg = "You do not have access to this") =>
  new AppError(403, "forbidden", msg);

export const notFound = (what = "That") =>
  new AppError(404, "not_found", `${what} could not be found`);

export const conflict = (msg: string) =>
  new AppError(409, "conflict", msg);

export const tooMany = (msg = "Too many attempts. Wait a moment and try again.") =>
  new AppError(429, "rate_limited", msg);

export const unprocessable = (msg: string, details?: unknown) =>
  new AppError(422, "unprocessable", msg, details);
