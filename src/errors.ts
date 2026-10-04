export type ErrorCode =
  | 'INVALID_DIMENSIONS'
  | 'RAGGED_MATRIX'
  | 'NON_FINITE_VALUE'
  | 'INVALID_ORIGIN'
  | 'INVALID_SPACING'
  | 'INVALID_THRESHOLD'
  | 'VALUE_EQUALS_THRESHOLD'
  | 'LIMIT_EXCEEDED'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL';

export class ContourError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function toErrorPayload(err: unknown): { code: ErrorCode; message: string; details?: unknown } {
  if (err instanceof ContourError) {
    return { code: err.code, message: err.message, details: err.details };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'INTERNAL', message };
}
