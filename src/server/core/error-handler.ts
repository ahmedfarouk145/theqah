/**
 * Centralized API error handler
 * Maps custom errors to HTTP responses
 * @module server/core/error-handler
 */

import type { NextApiResponse } from 'next';
import { AppError, ValidationError, RateLimitError } from './errors';

/**
 * Error response structure
 */
interface ErrorResponse {
    error: string;
    code?: string;
    field?: string;
    retryAfter?: number;
}

/**
 * Handle API errors and send appropriate HTTP response
 */
export function handleApiError(res: NextApiResponse, error: unknown): void {
    // Log error for debugging
    if (process.env.NODE_ENV !== 'production') {
        console.error('[API Error]', error);
    }

    // Handle known error types
    if (error instanceof AppError) {
        const response: ErrorResponse = {
            error: error.message,
            code: error.code,
        };

        // Add field for validation errors
        if (error instanceof ValidationError && error.field) {
            response.field = error.field;
        }

        // Add retry-after for rate limit errors
        if (error instanceof RateLimitError && error.retryAfter) {
            response.retryAfter = error.retryAfter;
            res.setHeader('Retry-After', error.retryAfter);
        }

        res.status(error.statusCode).json(response);
        return;
    }

    // Handle standard Error objects
    if (error instanceof Error) {
        // Check for known error message patterns
        const message = error.message.toLowerCase();

        if (message.includes('not found')) {
            res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
            return;
        }

        if (message.includes('unauthorized') || message.includes('unauthenticated')) {
            res.status(401).json({ error: 'unauthorized', code: 'UNAUTHORIZED' });
            return;
        }

        if (message.includes('forbidden') || message.includes('permission')) {
            res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' });
            return;
        }

        // Log unexpected errors
        console.error('[Unhandled Error]', error);
    }

    // Generic error response
    res.status(500).json({ error: 'internal_error', code: 'INTERNAL_ERROR' });
}

/**
 * Create a typed error handler wrapper for API routes
 */
export function withErrorHandler<T>(
    handler: (req: unknown, res: NextApiResponse) => Promise<T>
) {
    return async (req: unknown, res: NextApiResponse) => {
        try {
            await handler(req, res);
        } catch (error) {
            handleApiError(res, error);
        }
    };
}

// Re-export all error classes for convenience
export * from './errors';

