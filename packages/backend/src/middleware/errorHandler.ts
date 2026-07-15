import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';

/**
 * Professional Error Handling Middleware
 *
 * WhatsApp/Telegram-level: Centralized error handling with proper logging
 * Never exposes internal errors to clients
 */

export class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Operational errors vs programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Structural view of the errors this handler normalizes: our own {@link AppError}
 * plus the Mongoose / JWT shapes we branch on. Every field is optional because the
 * caught value is `unknown` until we inspect it.
 */
interface NormalizedError {
  statusCode?: number;
  status?: string;
  message?: string;
  name?: string;
  code?: number;
  isOperational?: boolean;
  stack?: string;
  path?: string;
  value?: unknown;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { message?: string }>;
}

/**
 * Async handler wrapper
 * Eliminates need for try/catch in every route
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => unknown
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle validation errors from express-validator
 */
function handleValidationError(error: NormalizedError): AppError {
  const message = Object.values(error.errors ?? {})
    .map((val) => val.message)
    .join('. ');
  return new AppError(`Invalid input: ${message}`, 400);
}

/**
 * Handle Mongoose cast errors (invalid MongoDB ObjectId)
 */
function handleCastError(error: NormalizedError): AppError {
  const message = `Invalid ${error.path}: ${String(error.value)}`;
  return new AppError(message, 400);
}

/**
 * Handle Mongoose duplicate key errors
 */
function handleDuplicateKeyError(error: NormalizedError): AppError {
  const keyValue = error.keyValue ?? {};
  const field = Object.keys(keyValue)[0];
  const value = keyValue[field];
  const message = `Duplicate value for field ${field}: ${String(value)}. Please use another value`;
  return new AppError(message, 409);
}

/**
 * Handle JWT errors
 */
function handleJWTError(): AppError {
  return new AppError('Invalid token. Please log in again', 401);
}

function handleJWTExpiredError(): AppError {
  return new AppError('Your token has expired. Please log in again', 401);
}

/**
 * Send error response in development mode
 * Includes stack trace and full error details
 */
function sendErrorDev(error: NormalizedError, req: Request, res: Response) {
  logger.error('ERROR 💥', {
    error: {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip,
    },
  });

  res.status(error.statusCode ?? 500).json({
    status: error.status,
    error: error,
    message: error.message,
    stack: error.stack,
  });
}

/**
 * Send error response in production mode
 * Hides internal errors from clients
 */
function sendErrorProd(error: NormalizedError, req: Request, res: Response) {
  // Operational, trusted error: send message to client
  if (error.isOperational) {
    logger.warn('Operational error', {
      message: error.message,
      statusCode: error.statusCode,
      url: req.originalUrl,
      method: req.method,
    });

    res.status(error.statusCode ?? 500).json({
      status: error.status,
      message: error.message,
    });
  } else {
    // Programming or unknown error: don't leak error details
    logger.error('ERROR 💥 Unexpected error', {
      error: {
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
      },
    });

    res.status(500).json({
      status: 'error',
      message: 'Something went wrong',
    });
  }
}

/**
 * Global error handling middleware
 * Must be the last middleware in the app
 *
 * @example
 * // In server.ts, AFTER all routes:
 * app.use(errorHandler);
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const normalized = err as NormalizedError;
  normalized.statusCode = normalized.statusCode || 500;
  normalized.status = normalized.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(normalized, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error: NormalizedError = { ...normalized };
    error.message = normalized.message;

    // Handle specific error types
    if (normalized.name === 'CastError') error = handleCastError(normalized);
    if (normalized.code === 11000) error = handleDuplicateKeyError(normalized);
    if (normalized.name === 'ValidationError') error = handleValidationError(normalized);
    if (normalized.name === 'JsonWebTokenError') error = handleJWTError();
    if (normalized.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};

/**
 * Handle 404 errors (route not found)
 * Must be placed AFTER all route definitions but BEFORE errorHandler
 *
 * @example
 * // In server.ts:
 * app.use('/api', routes);
 * app.use(notFoundHandler);
 * app.use(errorHandler);
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const error = new AppError(
    `Cannot ${req.method} ${req.originalUrl}`,
    404
  );
  next(error);
};

/**
 * Validation error helper
 * Use with express-validator
 *
 * @example
 * import { body, validationResult } from 'express-validator';
 *
 * router.post('/users',
 *   body('email').isEmail(),
 *   body('name').notEmpty(),
 *   validateRequest,
 *   async (req, res) => {
 *     // Validation passed, safe to proceed
 *   }
 * );
 */
export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new AppError(
      errors.array().map((e) => e.msg).join('. '),
      400
    );
    return next(error);
  }

  next();
};
