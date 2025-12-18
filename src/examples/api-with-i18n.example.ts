/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Example API Endpoint with i18n Error Handling
 * 
 * This file demonstrates how to use the new i18n error system
 * Copy these patterns to other API endpoints
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { handleApiError, Errors, asyncHandler } from '@/server/errors/error-handler';
import { getLocaleFromHeaders } from '@/locales/errors';

/**
 * Example 1: Basic usage with automatic locale detection
 */
export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    // Locale is automatically detected from Accept-Language header
    const locale = getLocaleFromHeaders(req.headers);

    // Your business logic here
    const data = await someOperation();

    if (!data) {
      // Error will be localized automatically
      throw Errors.notFound('Store', locale);
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    // Pass headers to handleApiError for automatic locale detection
    handleApiError(error, res, { headers: req.headers });
  }
});

/**
 * Example 2: Using validation errors with field names
 * @example Used in API endpoints for form validation
 */
async function handleValidation(req: NextApiRequest, _res: NextApiResponse) {
  const locale = getLocaleFromHeaders(req.headers);
  const { email, name } = req.body;

  if (!email) {
    throw Errors.validation(
      'Email is required',
      { field: 'email' },
      locale
    );
  }

  if (!name) {
    throw Errors.validation(
      'Name is required',
      { field: 'name' },
      locale
    );
  }

  // Continue with business logic...
}

/**
 * Example 3: Quota exceeded with custom details
 * @example Used in subscription quota checks
 */
async function handleQuotaCheck(_storeUid: string, locale: 'ar' | 'en' = 'ar') {
  const quota = await getQuota(_storeUid);

  if (quota.used >= quota.limit) {
    throw Errors.quotaExceeded(
      'Monthly limit reached',
      `${quota.used}/${quota.limit} reviews used`
    ).withLocale(locale);
  }

  // Continue with business logic...
}

/**
 * Example 4: External API errors
 * @example Used when calling external APIs like Salla
 */
async function callSallaAPI(locale: 'ar' | 'en' = 'ar') {
  try {
    const response = await fetch('https://api.salla.sa/...');
    if (!response.ok) {
      throw Errors.externalApi('Salla', response.statusText, locale);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw Errors.externalApi('Salla', error.message, locale);
    }
    throw error;
  }
}

/**
 * Example 5: Rate limiting
 * @example Used in rate limiting middleware
 */
async function checkRateLimit(_ip: string, locale: 'ar' | 'en' = 'ar') {
  const isLimited = await checkRateLimitForIP(_ip);

  if (isLimited) {
    // Will show: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد 15 دقيقة."
    throw Errors.rateLimitExceeded(15).withLocale(locale);
  }

  // Continue with business logic...
}

/**
 * Example 6: Complete endpoint with error handling
 */
export async function exampleCompleteEndpoint(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. Get locale from headers
    const locale = getLocaleFromHeaders(req.headers);

    // 2. Validate input
    const { storeUid, reviewId } = req.body;
    if (!storeUid) {
      throw Errors.validation('Store UID is required', { field: 'storeUid' }, locale);
    }

    // 3. Check permissions
    const hasPermission = await checkPermission(storeUid);
    if (!hasPermission) {
      throw Errors.forbidden('You do not have permission').withLocale(locale);
    }

    // 4. Check quota
    const canAdd = await canAddReview(storeUid);
    if (!canAdd) {
      throw Errors.quotaExceeded().withLocale(locale);
    }

    // 5. Perform operation
    const result = await doSomething(storeUid, reviewId);

    // 6. Return success
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // Error handling with automatic locale detection
    handleApiError(error, res, { 
      headers: req.headers,
      logError: true,
      includeStack: process.env.NODE_ENV === 'development'
    });
  }
}

// Dummy functions for examples
async function someOperation() { return null; }
async function getQuota(_storeUid: string) { return { used: 100, limit: 1000 }; }
async function checkRateLimitForIP(_ip: string) { return false; }
async function checkPermission(_storeUid: string) { return true; }
async function canAddReview(_storeUid: string) { return true; }
async function doSomething(_storeUid: string, _reviewId: string) { return {}; }
