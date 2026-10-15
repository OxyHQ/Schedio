import type { RequestHandler, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { z } from 'zod';
import type { ErrorCode } from '@schedio/contracts';
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
export const publishingErrors: ErrorRequestHandler = (error, _req, res, _next) => {
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
