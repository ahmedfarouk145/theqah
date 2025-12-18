// src/__tests__/error-handling/error-handler.test.ts
// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Request = { path?: string; method?: string };
type Response = { status?: (code: number) => Response; json?: (data: any) => void };

/**
 * Error Handler Tests (M11)
 * 
 * Tests for:
 * - AppError class
 * - Error creators
 * - handleApiError middleware
 * - Error response formatting
 */

// AppError class definition
class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.errorCode,
        statusCode: this.statusCode,
        ...(this.details && { details: this.details })
      }
    };
  }
}

// Error creators
const createValidationError = (message: string, details?: any): AppError => {
  return new AppError(message, 400, 'VALIDATION_ERROR', true, details);
};

const createNotFoundError = (resource: string): AppError => {
  return new AppError(`${resource} not found`, 404, 'NOT_FOUND', true);
};

const createAuthError = (message: string = 'Unauthorized'): AppError => {
  return new AppError(message, 401, 'AUTH_ERROR', true);
};

const createRateLimitError = (message: string = 'Too many requests'): AppError => {
  return new AppError(message, 429, 'RATE_LIMIT_EXCEEDED', true);
};

const createInternalError = (message: string = 'Internal server error'): AppError => {
  return new AppError(message, 500, 'INTERNAL_ERROR', false);
};

const createForbiddenError = (message: string = 'Forbidden'): AppError => {
  return new AppError(message, 403, 'FORBIDDEN', true);
};

// handleApiError middleware
const handleApiError = (
  error: Error | AppError,
  req: Request,
  res: Response
) => {
  // Default error values
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;
  let stack: string | undefined = undefined;

  // Check if it's an AppError
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.errorCode;
    message = error.message;
    details = error.details;
    stack = error.stack;
  } else {
    // Regular Error
    message = error.message || message;
    stack = error.stack;
  }

  // Log error
  console.error('[ERROR]', {
    code: errorCode,
    message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? stack : undefined
  });

  // Build response
  const response: any = {
    error: {
      message,
      code: errorCode,
      statusCode
    }
  };

  // Add details in development or if provided
  if (details) {
    response.error.details = details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && stack) {
    response.error.stack = stack;
  }

  // Send response
  res.status(statusCode).json(response);
};

describe('Error Handler', () => {
  
  describe('AppError Class', () => {
    
    it('should create AppError with all properties', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR', true, { field: 'email' });
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('TEST_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toEqual({ field: 'email' });
      expect(error.name).toBe('AppError');
    });
    
    it('should use default values when not provided', () => {
      const error = new AppError('Default error');
      
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toBeUndefined();
    });
    
    it('should capture stack trace', () => {
      const error = new AppError('Stack test');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Stack test');
      expect(error.stack).toContain('AppError');
    });
    
    it('should serialize to JSON correctly', () => {
      const error = new AppError('JSON test', 404, 'NOT_FOUND', true, { id: '123' });
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: {
          message: 'JSON test',
          code: 'NOT_FOUND',
          statusCode: 404,
          details: { id: '123' }
        }
      });
    });
    
    it('should serialize without details when not provided', () => {
      const error = new AppError('No details', 400, 'BAD_REQUEST');
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: {
          message: 'No details',
          code: 'BAD_REQUEST',
          statusCode: 400
        }
      });
    });
    
    it('should preserve error chain', () => {
      const appError = new AppError('Wrapped error', 500, 'WRAPPED', true);
      
      expect(appError).toBeInstanceOf(Error);
      expect(appError.name).toBe('AppError');
    });
  });
  
  describe('Error Creators', () => {
    
    it('should create validation error', () => {
      const error = createValidationError('Invalid email', { field: 'email', value: 'invalid' });
      
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid email');
      expect(error.isOperational).toBe(true);
      expect(error.details).toEqual({ field: 'email', value: 'invalid' });
    });
    
    it('should create validation error without details', () => {
      const error = createValidationError('Required field missing');
      
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.details).toBeUndefined();
    });
    
    it('should create not found error', () => {
      const error = createNotFoundError('Store');
      
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('NOT_FOUND');
      expect(error.message).toBe('Store not found');
      expect(error.isOperational).toBe(true);
    });
    
    it('should create auth error', () => {
      const error = createAuthError('Invalid token');
      
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('AUTH_ERROR');
      expect(error.message).toBe('Invalid token');
    });
    
    it('should create auth error with default message', () => {
      const error = createAuthError();
      
      expect(error.message).toBe('Unauthorized');
    });
    
    it('should create rate limit error', () => {
      const error = createRateLimitError('Too many login attempts');
      
      expect(error.statusCode).toBe(429);
      expect(error.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.message).toBe('Too many login attempts');
    });
    
    it('should create rate limit error with default message', () => {
      const error = createRateLimitError();
      
      expect(error.message).toBe('Too many requests');
    });
    
    it('should create internal error', () => {
      const error = createInternalError('Database connection failed');
      
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('Database connection failed');
      expect(error.isOperational).toBe(false);
    });
    
    it('should create internal error with default message', () => {
      const error = createInternalError();
      
      expect(error.message).toBe('Internal server error');
    });
    
    it('should create forbidden error', () => {
      const error = createForbiddenError('Insufficient permissions');
      
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe('FORBIDDEN');
      expect(error.message).toBe('Insufficient permissions');
    });
  });
  
  describe('handleApiError Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let consoleErrorSpy: any;

    beforeEach(() => {
      mockReq = {
        path: '/api/test',
        method: 'POST'
      };
      
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });
    
    it('should handle AppError correctly', () => {
      const error = createValidationError('Invalid input', { field: 'name' });
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Invalid input',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: { field: 'name' }
        }
      });
    });
    
    it('should handle regular Error', () => {
      const error = new Error('Regular error');
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Regular error',
          code: 'INTERNAL_ERROR',
          statusCode: 500
        }
      });
    });
    
    it('should include stack trace in development mode', () => {
      vi.stubEnv('NODE_ENV', 'development');
      
      const error = createInternalError('Dev error');
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      const response = (mockRes.json as any).mock.calls[0][0];
      expect(response.error.stack).toBeDefined();
      
      vi.unstubAllEnvs();
    });
    
    it('should not include stack trace in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      
      const error = createInternalError('Prod error');
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      const response = (mockRes.json as any).mock.calls[0][0];
      expect(response.error.stack).toBeUndefined();
      
      vi.unstubAllEnvs();
    });
    
    it('should log error with context', () => {
      const error = createNotFoundError('User');
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0];
      expect(logCall[0]).toBe('[ERROR]');
      expect(logCall[1]).toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
        path: '/api/test',
        method: 'POST'
      });
    });
    
    it('should handle 401 auth errors', () => {
      const error = createAuthError('Invalid credentials');
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Invalid credentials',
          code: 'AUTH_ERROR',
          statusCode: 401
        }
      });
    });
    
    it('should handle 403 forbidden errors', () => {
      const error = createForbiddenError('Access denied');
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
          statusCode: 403
        }
      });
    });
    
    it('should handle 404 not found errors', () => {
      const error = createNotFoundError('Resource');
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Resource not found',
          code: 'NOT_FOUND',
          statusCode: 404
        }
      });
    });
    
    it('should handle 429 rate limit errors', () => {
      const error = createRateLimitError();
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429
        }
      });
    });
    
    it('should handle errors without message', () => {
      const error = new Error();
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      const response = (mockRes.json as any).mock.calls[0][0];
      expect(response.error.message).toBe('Internal server error');
    });
    
    it('should include details when provided', () => {
      const error = createValidationError('Validation failed', {
        fields: ['email', 'password'],
        errors: { email: 'Invalid format', password: 'Too short' }
      });
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      const response = (mockRes.json as any).mock.calls[0][0];
      expect(response.error.details).toEqual({
        fields: ['email', 'password'],
        errors: { email: 'Invalid format', password: 'Too short' }
      });
    });
    
    it('should format response consistently', () => {
      const error = createNotFoundError('Store');
      
      handleApiError(error, mockReq as Request, mockRes as Response);
      
      const response = (mockRes.json as any).mock.calls[0][0];
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('message');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('statusCode');
    });
  });
  
  describe('Error Status Codes', () => {
    
    it('should use correct status codes for different errors', () => {
      const errors = [
        { creator: createValidationError, args: ['Test'], expectedStatus: 400 },
        { creator: createAuthError, args: ['Test'], expectedStatus: 401 },
        { creator: createForbiddenError, args: ['Test'], expectedStatus: 403 },
        { creator: createNotFoundError, args: ['Test'], expectedStatus: 404 },
        { creator: createRateLimitError, args: ['Test'], expectedStatus: 429 },
        { creator: createInternalError, args: ['Test'], expectedStatus: 500 }
      ];
      
      errors.forEach(({ creator, args, expectedStatus }) => {
        const error = (creator as any)(...args);
        expect(error.statusCode).toBe(expectedStatus);
      });
    });
  });
  
  describe('Error Codes', () => {
    
    it('should use correct error codes', () => {
      expect(createValidationError('test').errorCode).toBe('VALIDATION_ERROR');
      expect(createAuthError('test').errorCode).toBe('AUTH_ERROR');
      expect(createForbiddenError('test').errorCode).toBe('FORBIDDEN');
      expect(createNotFoundError('test').errorCode).toBe('NOT_FOUND');
      expect(createRateLimitError('test').errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(createInternalError('test').errorCode).toBe('INTERNAL_ERROR');
    });
  });
  
  describe('Operational Errors', () => {
    
    it('should mark validation errors as operational', () => {
      const error = createValidationError('test');
      expect(error.isOperational).toBe(true);
    });
    
    it('should mark auth errors as operational', () => {
      const error = createAuthError('test');
      expect(error.isOperational).toBe(true);
    });
    
    it('should mark not found errors as operational', () => {
      const error = createNotFoundError('test');
      expect(error.isOperational).toBe(true);
    });
    
    it('should mark internal errors as non-operational', () => {
      const error = createInternalError('test');
      expect(error.isOperational).toBe(false);
    });
  });
});
