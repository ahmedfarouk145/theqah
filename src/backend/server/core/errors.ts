/**
 * Custom error classes for proper error handling across layers
 * @module server/core/errors
 */

/** Base error class for all custom errors */
export class AppError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode: number = 500
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/** Entity not found error */
export class NotFoundError extends AppError {
    constructor(entity: string, id?: string) {
        super(
            id ? `${entity} with id '${id}' not found` : `${entity} not found`,
            'NOT_FOUND',
            404
        );
    }
}

/** Validation error */
export class ValidationError extends AppError {
    constructor(message: string, public readonly field?: string) {
        super(message, 'VALIDATION_ERROR', 400);
    }
}

/** Unauthorized error */
export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(message, 'UNAUTHORIZED', 401);
    }
}

/** Forbidden error */
export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
        super(message, 'FORBIDDEN', 403);
    }
}

/** Duplicate entity error */
export class DuplicateEntityError extends AppError {
    constructor(entity: string, field?: string) {
        super(
            field ? `${entity} with this ${field} already exists` : `${entity} already exists`,
            'DUPLICATE_ENTITY',
            409
        );
    }
}

/** Token error types */
export type TokenErrorType = 'expired' | 'used' | 'voided' | 'not_found' | 'invalid';

/** Token-specific error */
export class TokenError extends AppError {
    constructor(
        public readonly type: TokenErrorType,
        message?: string
    ) {
        const messages: Record<TokenErrorType, string> = {
            expired: 'Token has expired',
            used: 'Token has already been used',
            voided: 'Token has been voided',
            not_found: 'Token not found',
            invalid: 'Invalid token',
        };

        const statusCodes: Record<TokenErrorType, number> = {
            expired: 410,
            used: 409,
            voided: 410,
            not_found: 400,
            invalid: 400,
        };

        super(message || messages[type], `TOKEN_${type.toUpperCase()}`, statusCodes[type]);
    }
}

/** Rate limit exceeded error */
export class RateLimitError extends AppError {
    constructor(
        public readonly retryAfter?: number
    ) {
        super('Rate limit exceeded', 'RATE_LIMIT', 429);
    }
}

/** Quota exceeded error */
export class QuotaExceededError extends AppError {
    constructor(resource: string, limit?: number) {
        super(
            limit ? `${resource} quota exceeded (limit: ${limit})` : `${resource} quota exceeded`,
            'QUOTA_EXCEEDED',
            402
        );
    }
}

/** External service error */
export class ExternalServiceError extends AppError {
    constructor(
        service: string,
        public readonly originalError?: Error
    ) {
        super(`${service} service error: ${originalError?.message || 'Unknown error'}`, 'EXTERNAL_SERVICE_ERROR', 502);
    }
}
