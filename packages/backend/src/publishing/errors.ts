import type { RequestHandler, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { z } from 'zod';
import type { ErrorCode } from '@schedio/contracts';
import { accessErrorStatus, OxyAccessError } from '@oxy.so/core/server';
export class PublishingError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: z.infer<typeof ErrorCode>,
    message: string,
  ) {
    super(message);
  }
}
export const route =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
/** What Oxy's answer about the caller's access becomes: 401, 403, or 503 when Oxy could not say. */
const ACCESS_ANSWERS = {
  401: { code: 'unauthorized', message: 'Sign in to Oxy again' },
  403: { code: 'forbidden', message: 'You may not do this for this organization' },
  404: { code: 'not_found', message: 'Not found' },
  503: { code: 'service_unavailable', message: 'Oxy could not confirm your access; try again' },
} as const satisfies Record<number, { code: z.infer<typeof ErrorCode>; message: string }>;
export const publishingErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof OxyAccessError) {
    const status = accessErrorStatus(error);
    res.status(status).json({ error: ACCESS_ANSWERS[status] });
    return;
  }
  if (error instanceof PublishingError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: { code: 'bad_request', message: 'Invalid JSON request' } });
    return;
  }
  if (error instanceof ZodError) {
    res
      .status(422)
      .json({ error: { code: 'validation_failed', message: 'Invalid publishing input' } });
    return;
  }
  res.status(503).json({
    error: {
      code: 'service_unavailable',
      message: 'Publishing service is temporarily unavailable',
    },
  });
};
