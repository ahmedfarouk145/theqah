/**
 * Standardized Error Handling Utilities
 * 
 * Provides consistent error handling patterns across the application
 * Supports Arabic and English error messages via i18n
 */

import type { NextApiResponse } from 'next';
import { 
  getErrorMessage, 
  translateResource, 
  getLocaleFromHeaders,
  formatErrorResponse,
  type Locale,
  type ErrorCode as I18nErrorCode 
} from '@/locales/errors';

/**
 * Application error codes
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  INVALID_TOKEN: 'invalid_token',
  TOKEN_EXPIRED: 'token_expired',
  
  // Validation
  VALIDATION_ERROR: 'validation_error',
  MISSING_REQUIRED_FIELD: 'missing_required_field',
  INVALID_FORMAT: 'invalid_format',
  
  // Resources
  NOT_FOUND: 'not_found',
  ALREADY_EXISTS: 'already_exists',
  DUPLICATE: 'duplicate',
  
  // Operations
  OPERATION_FAILED: 'operation_failed',
  TRANSACTION_FAILED: 'transaction_failed',
  EXTERNAL_API_ERROR: 'external_api_error',
  
  // Business Logic
  QUOTA_EXCEEDED: 'quota_exceeded',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INSUFFICIENT_PERMISSIONS: 'insufficient_permissions',
  
  // System
  INTERNAL_ERROR: 'internal_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  TIMEOUT: 'timeout',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Application error class with i18n support
 */
export class AppError extends Error {
  public locale: Locale = 'ar';
  public params?: Record<string, string | number>;

  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  /**
   * Set locale for error message
   */
  withLocale(locale: Locale): this {
    this.locale = locale;
    return this;
  }

  /**
   * Set parameters for message interpolation
   */
  withParams(params: Record<string, string | number>): this {
    this.params = params;
    return this;
  }

  /**
   * Get localized message
   */
  getLocalizedMessage(): string {
    // Try to get i18n message
    const i18nCode = this.code.toUpperCase().replace(/_/g, '_') as I18nErrorCode;
    try {
      return getErrorMessage(i18nCode, this.locale, this.params);
    } catch {
      // Fallback to original message
      return this.message;
    }
  }

  toJSON() {
    return {
      error: this.code,
      message: this.getLocalizedMessage(),
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Common error creators with i18n support
 */
export const Errors = {
  unauthorized: (message = 'Unauthorized') =>
    new AppError(ErrorCodes.UNAUTHORIZED, message, 401),

  forbidden: (message = 'Forbidden') =>
    new AppError(ErrorCodes.FORBIDDEN, message, 403),

  notFound: (resource: string, locale: Locale = 'ar') => {
    const translatedResource = translateResource(resource, locale);
    return new AppError(ErrorCodes.NOT_FOUND, `${resource} not found`, 404)
      .withLocale(locale)
      .withParams({ resource: translatedResource });
  },

  validation: (message: string, details?: unknown, locale: Locale = 'ar') =>
    new AppError(ErrorCodes.VALIDATION_ERROR, message, 400, details).withLocale(locale),

  duplicate: (resource: string, locale: Locale = 'ar') => {
    const translatedResource = translateResource(resource, locale);
    return new AppError(ErrorCodes.DUPLICATE, `${resource} already exists`, 409)
      .withLocale(locale)
      .withParams({ resource: translatedResource });
  },

  quotaExceeded: (message = 'Quota exceeded', details?: string) =>
    new AppError(ErrorCodes.QUOTA_EXCEEDED, message, 429)
      .withParams({ details: details || '' }),

  rateLimitExceeded: (retryMinutes?: number) =>
    new AppError(ErrorCodes.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded', 429)
      .withParams({ retry: String(retryMinutes || 15) }),

  externalApi: (service: string, message: string, locale: Locale = 'ar') =>
    new AppError(
      ErrorCodes.EXTERNAL_API_ERROR,
      `${service} API error: ${message}`,
      502
    )
      .withLocale(locale)
      .withParams({ service }),

  internal: (message = 'Internal server error', details?: unknown) =>
    new AppError(ErrorCodes.INTERNAL_ERROR, message, 500, details),
};

/**
 * Error handler middleware for API routes with i18n support
 */
export function handleApiError(
  error: unknown,
  res: NextApiResponse,
  options: {
    logError?: boolean;
    includeStack?: boolean;
    locale?: Locale;
    headers?: Record<string, string | string[] | undefined>;
  } = {}
): void {
  const { 
    logError = true, 
    includeStack = process.env.NODE_ENV === 'development',
    headers
  } = options;

  // Determine locale from headers or options
  const locale = options.locale || (headers ? getLocaleFromHeaders(headers) : 'ar');

  // Handle AppError
  if (error instanceof AppError) {
    if (logError) {
      console.error(`[AppError] ${error.code}:`, error.message, error.details);
    }

    // Set locale if not already set
    if (!error.locale || error.locale === 'ar') {
      error.withLocale(locale);
    }

    res.status(error.statusCode).json({
      ...error.toJSON(),
      ...(includeStack && { stack: error.stack }),
    });
    return;
  }

  // Handle standard Error
  if (error instanceof Error) {
    if (logError) {
      console.error('[Error]:', error.message, error.stack);
    }

    res.status(500).json({
      error: ErrorCodes.INTERNAL_ERROR,
      message: getErrorMessage('INTERNAL_ERROR', locale),
      ...(includeStack && { stack: error.stack }),
    });
    return;
  }

  // Handle unknown errors
  if (logError) {
    console.error('[Unknown Error]:', error);
  }

  res.status(500).json({
    error: ErrorCodes.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
    ...(includeStack && { details: error }),
  });
}

/**
 * Async route handler wrapper
 * Automatically catches errors and sends appropriate response
 */
export function asyncHandler<T = unknown>(
  handler: (req: T, res: NextApiResponse) => Promise<void>
) {
  return async (req: T, res: NextApiResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      handleApiError(error, res);
    }
  };
}

/**
 * Try-catch wrapper with consistent error handling
 */
export async function tryCatch<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  options: {
    logError?: boolean;
    defaultValue?: T;
    rethrow?: boolean;
  } = {}
): Promise<T | undefined> {
  const { logError = true, defaultValue, rethrow = true } = options;

  try {
    return await operation();
  } catch (error) {
    if (logError) {
      console.error(`[${errorMessage}]`, error);
    }

    if (rethrow) {
      throw error;
    }

    return defaultValue;
  }
}

/**
 * Retry operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 10000,
    onRetry,
    shouldRetry = () => true,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry if we're out of attempts or shouldn't retry
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

      onRetry?.(attempt + 1, lastError);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Validate and throw if invalid
 */
export function validate(
  condition: boolean,
  message: string,
  details?: unknown
): asserts condition {
  if (!condition) {
    throw Errors.validation(message, details);
  }
}

/**
 * Assert resource exists
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw Errors.notFound(resource);
  }
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T = unknown>(
  json: string,
  defaultValue?: T
): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Error boundary for background operations
 * Catches and logs errors without crashing
 */
export async function errorBoundary(
  operation: () => Promise<void>,
  context: string
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    console.error(`[${context}] Background operation failed:`, error);
    // Don't rethrow - this is for fire-and-forget operations
  }
}

/**
 * Group multiple errors
 */
export class ErrorGroup extends Error {
  constructor(
    public errors: Error[],
    message = `Multiple errors occurred (${errors.length})`
  ) {
    super(message);
    this.name = 'ErrorGroup';
  }

  toJSON() {
    return {
      error: 'multiple_errors',
      message: this.message,
      errors: this.errors.map(e => ({
        message: e.message,
        ...(e instanceof AppError && { code: e.code }),
      })),
    };
  }
}

/**
 * Execute operations in parallel and collect errors
 */
export async function parallelWithErrors<T>(
  operations: Array<() => Promise<T>>
): Promise<{ results: T[]; errors: Error[] }> {
  const results: T[] = [];
  const errors: Error[] = [];

  await Promise.all(
    operations.map(async (operation, index) => {
      try {
        results[index] = await operation();
      } catch (error) {
        errors.push(error as Error);
      }
    })
  );

  return { results: results.filter(r => r !== undefined), errors };
}
