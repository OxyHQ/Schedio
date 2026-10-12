/**
 * Readers for values caught in a `catch`, which TypeScript types as `unknown`.
 * They never assume the thrown value is an Error: SDKs and axios throw plain objects too.
 */

function field(value: unknown, key: string): unknown {
  if (typeof value === 'object' && value !== null && key in value) {
    return (value as Record<string, unknown>)[key];
  }
  return undefined;
}

/** `error.message` when it is a string, otherwise undefined. */
export function errorMessage(error: unknown): string | undefined {
  const message = field(error, 'message');
  return typeof message === 'string' ? message : undefined;
}

/** The axios-style `error.response`, if the thrown value carries one. */
export function errorResponse(error: unknown): unknown {
  return field(error, 'response');
}

/** The axios-style HTTP status (`error.response.status`) when it is a number. */
export function errorStatus(error: unknown): number | undefined {
  const status = field(errorResponse(error), 'status');
  return typeof status === 'number' ? status : undefined;
}
