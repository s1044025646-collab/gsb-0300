export type ErrorCode =
  | "E_VALIDATION"
  | "E_THRESHOLD_ON_VERTEX"
  | "E_NOT_FOUND"
  | "E_LIMIT_EXCEEDED"
  | "E_INTERNAL";

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toErrorBody(err: unknown): { code: ErrorCode; message: string; details?: unknown } {
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message, details: err.details };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: "E_INTERNAL", message };
}
