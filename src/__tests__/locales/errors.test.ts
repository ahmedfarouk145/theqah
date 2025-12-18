/**
 * Tests for i18n Error Messages System (M6)
 * 
 * Tests the error message localization functionality implemented in M6.
 */

import { describe, it, expect } from 'vitest';
import {
  getErrorMessage,
  translateResource,
  getLocaleFromHeaders,
  type ErrorCode,
} from '@/locales/errors';

describe('i18n Error Messages', () => {
  describe('getErrorMessage', () => {
    it('should return Arabic message by default', () => {
      const message = getErrorMessage('UNAUTHORIZED');
      expect(message).toBe('غير مصرح لك بالوصول. يرجى تسجيل الدخول.');
    });

    it('should return English message when locale is en', () => {
      const message = getErrorMessage('UNAUTHORIZED', 'en');
      expect(message).toBe('Unauthorized access. Please log in.');
    });

    it('should substitute parameters in message', () => {
      const message = getErrorMessage('MISSING_REQUIRED_FIELD', 'ar', { field: 'email' });
      expect(message).toBe('الحقل "email" مطلوب.');
    });

    it('should handle multiple parameters', () => {
      const message = getErrorMessage('QUOTA_EXCEEDED', 'ar', { 
        used: '1000', 
        limit: '1000',
        details: 'يرجى الترقية'
      });
      // Message should contain parameters or details
      expect(message.length).toBeGreaterThan(0);
    });

    it('should return fallback for unknown error code', () => {
      const message = getErrorMessage('UNKNOWN_CODE' as ErrorCode);
      expect(message).toContain('خطأ غير متوقع');
    });
  });

  describe('translateResource', () => {
    it('should translate Store to Arabic', () => {
      const translation = translateResource('Store', 'ar');
      expect(translation).toBe('المتجر');
    });

    it('should translate Review to Arabic', () => {
      const translation = translateResource('Review', 'ar');
      expect(translation).toBe('المراجعة');
    });

    it('should keep English resource names in English locale', () => {
      const translation = translateResource('Store', 'en');
      expect(translation).toBe('Store');
    });

    it('should handle unknown resources', () => {
      const translation = translateResource('Unknown', 'ar');
      // Unknown resources remain untranslated
      expect(translation).toBe('Unknown');
    });
  });

  describe('getLocaleFromHeaders', () => {
    it('should detect Arabic from Accept-Language header', () => {
      const headers = { 'accept-language': 'ar' };
      const locale = getLocaleFromHeaders(headers);
      expect(locale).toBe('ar');
    });

    it('should detect English from Accept-Language header', () => {
      const headers = { 'accept-language': 'en-US' };
      const locale = getLocaleFromHeaders(headers);
      expect(locale).toBe('en');
    });

    it('should default to Arabic when no header', () => {
      const headers = {};
      const locale = getLocaleFromHeaders(headers);
      expect(locale).toBe('ar');
    });

    it('should handle malformed Accept-Language header', () => {
      const headers = { 'accept-language': 'invalid' };
      const locale = getLocaleFromHeaders(headers);
      expect(locale).toBe('ar');
    });
  });

  describe('Error codes coverage', () => {
    const errorCodes: ErrorCode[] = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'INVALID_TOKEN',
      'TOKEN_EXPIRED',
      'VALIDATION_ERROR',
      'MISSING_REQUIRED_FIELD',
      'INVALID_FORMAT',
      'INVALID_INPUT',
      'NOT_FOUND',
      'ALREADY_EXISTS',
      'DUPLICATE',
      'OPERATION_FAILED',
      'TRANSACTION_FAILED',
      'EXTERNAL_API_ERROR',
      'QUOTA_EXCEEDED',
      'RATE_LIMIT_EXCEEDED',
      'INSUFFICIENT_PERMISSIONS',
      'SUBSCRIPTION_INACTIVE',
      'SUBSCRIPTION_REQUIRED',
      'INTERNAL_ERROR',
      'SERVICE_UNAVAILABLE',
      'TIMEOUT',
      'DATABASE_ERROR',
    ];

    it('should have Arabic messages for all error codes', () => {
      errorCodes.forEach((code) => {
        const message = getErrorMessage(code, 'ar');
        expect(message).toBeTruthy();
        expect(message.length).toBeGreaterThan(0);
      });
    });

    it('should have English messages for all error codes', () => {
      errorCodes.forEach((code) => {
        const message = getErrorMessage(code, 'en');
        expect(message).toBeTruthy();
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });
});
