// src/__tests__/utils/verification.test.ts
import { describe, it, expect } from 'vitest';

/**
 * Verification Utils Tests (M4)
 * 
 * Tests for input validation:
 * - Mobile number validation (Saudi format)
 * - Email validation
 * - URL validation
 * - ID format validation
 */

// Mobile validation (Saudi format)
const isValidSaudiMobile = (mobile: string): boolean => {
  if (!mobile) return false;
  
  // Remove spaces and special characters
  const cleaned = mobile.replace(/[\s\-\(\)]/g, '');
  
  // Saudi format: 966XXXXXXXXX (12 digits starting with 966)
  // or 5XXXXXXXX (9 digits starting with 5)
  const saudiPattern = /^(966)?5[0-9]{8}$/;
  
  return saudiPattern.test(cleaned);
};

// Normalize Saudi mobile to international format
const normalizeSaudiMobile = (mobile: string): string => {
  if (!mobile) return '';
  
  // Remove spaces and special characters
  let cleaned = mobile.replace(/[\s\-\(\)]/g, '');
  
  // Remove + prefix
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // If starts with 966, check for duplication
  if (cleaned.startsWith('966966')) {
    cleaned = cleaned.substring(3);
  }
  
  // If starts with 0, replace with 966
  if (cleaned.startsWith('0')) {
    cleaned = '966' + cleaned.substring(1);
  }
  
  // If starts with 5 (9 digits), add 966
  if (cleaned.length === 9 && cleaned.startsWith('5')) {
    cleaned = '966' + cleaned;
  }
  
  return cleaned;
};

// Email validation (RFC 5322 simplified)
const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailPattern.test(email);
};

// URL validation
const isValidUrl = (url: string): boolean => {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Store UID validation
const isValidStoreUid = (uid: string): boolean => {
  if (!uid) return false;
  
  // Format: alphanumeric, 8-32 characters
  const pattern = /^[a-zA-Z0-9_-]{8,32}$/;
  return pattern.test(uid);
};

// Order ID validation
const isValidOrderId = (orderId: string): boolean => {
  if (!orderId) return false;
  
  // Format: numeric or alphanumeric, 1-20 characters
  const pattern = /^[a-zA-Z0-9]{1,20}$/;
  return pattern.test(orderId);
};

// Review ID validation
const isValidReviewId = (reviewId: string): boolean => {
  if (!reviewId) return false;
  
  // Format: alphanumeric with hyphens, 8-36 characters
  const pattern = /^[a-zA-Z0-9-]{8,36}$/;
  return pattern.test(reviewId);
};

describe('Verification Utils', () => {
  
  describe('Saudi Mobile Validation', () => {
    
    it('should accept valid Saudi mobile with 966 prefix', () => {
      expect(isValidSaudiMobile('966501234567')).toBe(true);
      expect(isValidSaudiMobile('966551234567')).toBe(true);
      expect(isValidSaudiMobile('966541234567')).toBe(true);
    });
    
    it('should accept valid Saudi mobile without 966 prefix', () => {
      expect(isValidSaudiMobile('501234567')).toBe(true);
      expect(isValidSaudiMobile('551234567')).toBe(true);
    });
    
    it('should reject mobile not starting with 5', () => {
      expect(isValidSaudiMobile('966601234567')).toBe(false);
      expect(isValidSaudiMobile('401234567')).toBe(false);
    });
    
    it('should reject mobile with wrong length', () => {
      expect(isValidSaudiMobile('96650123456')).toBe(false); // Too short
      expect(isValidSaudiMobile('9665012345678')).toBe(false); // Too long
      expect(isValidSaudiMobile('50123456')).toBe(false); // Too short
    });
    
    it('should reject empty or null mobile', () => {
      expect(isValidSaudiMobile('')).toBe(false);
      expect(isValidSaudiMobile(null as any)).toBe(false);
      expect(isValidSaudiMobile(undefined as any)).toBe(false);
    });
    
    it('should accept mobile with spaces and special characters', () => {
      expect(isValidSaudiMobile('966 50 123 4567')).toBe(true);
      expect(isValidSaudiMobile('966-50-123-4567')).toBe(true);
      expect(isValidSaudiMobile('(966) 50-123-4567')).toBe(true);
    });
  });
  
  describe('Saudi Mobile Normalization', () => {
    
    it('should normalize mobile with 966 prefix', () => {
      expect(normalizeSaudiMobile('966501234567')).toBe('966501234567');
    });
    
    it('should add 966 prefix to mobile starting with 0', () => {
      expect(normalizeSaudiMobile('0501234567')).toBe('966501234567');
    });
    
    it('should add 966 prefix to 9-digit mobile', () => {
      expect(normalizeSaudiMobile('501234567')).toBe('966501234567');
    });
    
    it('should remove + prefix', () => {
      expect(normalizeSaudiMobile('+966501234567')).toBe('966501234567');
    });
    
    it('should fix duplicated 966 prefix', () => {
      expect(normalizeSaudiMobile('966966501234567')).toBe('966501234567');
    });
    
    it('should remove spaces and special characters', () => {
      expect(normalizeSaudiMobile('966 50 123 4567')).toBe('966501234567');
      expect(normalizeSaudiMobile('966-50-123-4567')).toBe('966501234567');
      expect(normalizeSaudiMobile('(966) 50-123-4567')).toBe('966501234567');
    });
    
    it('should return empty string for invalid input', () => {
      expect(normalizeSaudiMobile('')).toBe('');
      expect(normalizeSaudiMobile(null as any)).toBe('');
    });
  });
  
  describe('Email Validation', () => {
    
    it('should accept valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
      expect(isValidEmail('user_name@example-domain.com')).toBe(true);
    });
    
    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@.com')).toBe(false);
    });
    
    it('should reject emails with spaces', () => {
      expect(isValidEmail('user name@example.com')).toBe(false);
      expect(isValidEmail('user@example .com')).toBe(false);
    });
    
    it('should reject emails without domain', () => {
      expect(isValidEmail('user@localhost')).toBe(false);
    });
    
    it('should reject empty or null email', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null as any)).toBe(false);
      expect(isValidEmail(undefined as any)).toBe(false);
    });
  });
  
  describe('URL Validation', () => {
    
    it('should accept valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://example.com/path')).toBe(true);
      expect(isValidUrl('http://example.com/path?query=1')).toBe(true);
    });
    
    it('should accept valid HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://subdomain.example.com')).toBe(true);
      expect(isValidUrl('https://example.com:8080')).toBe(true);
    });
    
    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl('//example.com')).toBe(false);
    });
    
    it('should reject non-HTTP protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('file:///path/to/file')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });
    
    it('should reject empty or null URL', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl(null as any)).toBe(false);
      expect(isValidUrl(undefined as any)).toBe(false);
    });
  });
  
  describe('Store UID Validation', () => {
    
    it('should accept valid store UIDs', () => {
      expect(isValidStoreUid('store-123456')).toBe(true);
      expect(isValidStoreUid('store_abc123')).toBe(true);
      expect(isValidStoreUid('STORE123456')).toBe(true);
      expect(isValidStoreUid('12345678')).toBe(true);
    });
    
    it('should reject store UIDs that are too short', () => {
      expect(isValidStoreUid('store')).toBe(false);
      expect(isValidStoreUid('1234567')).toBe(false); // 7 chars
    });
    
    it('should reject store UIDs that are too long', () => {
      expect(isValidStoreUid('a'.repeat(33))).toBe(false);
    });
    
    it('should reject store UIDs with special characters', () => {
      expect(isValidStoreUid('store@123')).toBe(false);
      expect(isValidStoreUid('store#123')).toBe(false);
      expect(isValidStoreUid('store 123')).toBe(false);
    });
    
    it('should reject empty or null store UID', () => {
      expect(isValidStoreUid('')).toBe(false);
      expect(isValidStoreUid(null as any)).toBe(false);
      expect(isValidStoreUid(undefined as any)).toBe(false);
    });
  });
  
  describe('Order ID Validation', () => {
    
    it('should accept valid order IDs', () => {
      expect(isValidOrderId('12345')).toBe(true);
      expect(isValidOrderId('ORD123')).toBe(true);
      expect(isValidOrderId('a1b2c3')).toBe(true);
    });
    
    it('should reject order IDs that are too long', () => {
      expect(isValidOrderId('a'.repeat(21))).toBe(false);
    });
    
    it('should reject order IDs with special characters', () => {
      expect(isValidOrderId('order-123')).toBe(false);
      expect(isValidOrderId('order_123')).toBe(false);
      expect(isValidOrderId('order 123')).toBe(false);
    });
    
    it('should reject empty or null order ID', () => {
      expect(isValidOrderId('')).toBe(false);
      expect(isValidOrderId(null as any)).toBe(false);
      expect(isValidOrderId(undefined as any)).toBe(false);
    });
  });
  
  describe('Review ID Validation', () => {
    
    it('should accept valid review IDs', () => {
      expect(isValidReviewId('review-12345678')).toBe(true);
      expect(isValidReviewId('abc123-def456')).toBe(true);
      expect(isValidReviewId('12345678-1234-1234-1234-123456789012')).toBe(true); // UUID format
    });
    
    it('should reject review IDs that are too short', () => {
      expect(isValidReviewId('review')).toBe(false);
      expect(isValidReviewId('1234567')).toBe(false); // 7 chars
    });
    
    it('should reject review IDs that are too long', () => {
      expect(isValidReviewId('a'.repeat(37))).toBe(false);
    });
    
    it('should reject review IDs with special characters', () => {
      expect(isValidReviewId('review@123')).toBe(false);
      expect(isValidReviewId('review_123')).toBe(false);
      expect(isValidReviewId('review 123')).toBe(false);
    });
    
    it('should reject empty or null review ID', () => {
      expect(isValidReviewId('')).toBe(false);
      expect(isValidReviewId(null as any)).toBe(false);
      expect(isValidReviewId(undefined as any)).toBe(false);
    });
  });
  
  describe('Combined Validation', () => {
    
    it('should validate complete user data', () => {
      const userData = {
        email: 'user@example.com',
        mobile: '966501234567',
        storeUid: 'store-12345678'
      };
      
      expect(isValidEmail(userData.email)).toBe(true);
      expect(isValidSaudiMobile(userData.mobile)).toBe(true);
      expect(isValidStoreUid(userData.storeUid)).toBe(true);
    });
    
    it('should validate complete order data', () => {
      const orderData = {
        orderId: 'ORD12345',
        storeUid: 'store-12345678',
        customerMobile: '501234567' // 9 digits format
      };
      
      expect(isValidOrderId(orderData.orderId)).toBe(true);
      expect(isValidStoreUid(orderData.storeUid)).toBe(true);
      expect(isValidSaudiMobile(orderData.customerMobile)).toBe(true);
    });
  });
});
