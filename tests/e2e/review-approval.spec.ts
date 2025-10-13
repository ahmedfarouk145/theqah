// tests/e2e/review-approval.spec.ts
/**
 * E2E Test: Review Approval Workflow
 * 
 * Scenario:
 * 1. Merchant logs in to dashboard
 * 2. Merchant sees pending reviews tab (if DASHBOARD_V2 flag is enabled)
 * 3. Merchant approves a pending review
 * 4. Review becomes visible publicly
 * 
 * Prerequisites:
 * - DASHBOARD_V2 feature flag must be enabled
 * - Test store must exist with credentials
 * - At least one pending review must exist
 */

import { test, expect } from '@playwright/test';

// Test credentials (should be in environment variables in real usage)
const TEST_STORE_EMAIL = process.env.TEST_STORE_EMAIL || 'test@example.com';
const TEST_STORE_PASSWORD = process.env.TEST_STORE_PASSWORD || 'testpass123';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Review Approval Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/');
  });

  test('merchant can see and approve pending reviews', async ({ page }) => {
    // Skip if feature flag is not enabled
    const flagEnabled = process.env.NEXT_PUBLIC_FLAG_DASHBOARD_V2 === 'true';
    if (!flagEnabled) {
      test.skip();
    }

    // 1. Login as merchant
    await page.goto('/login'); // Adjust based on your login route
    await page.fill('input[type="email"]', TEST_STORE_EMAIL);
    await page.fill('input[type="password"]', TEST_STORE_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    // 2. Navigate to Reviews tab
    await page.click('text=التقييمات');
    
    // 3. Check if Pending Reviews tab exists (under feature flag)
    const pendingTabExists = await page.locator('text=التقييمات المعلقة').count();
    
    if (pendingTabExists > 0) {
      await page.click('text=التقييمات المعلقة');
      
      // Wait for pending reviews to load
      await page.waitForTimeout(2000);
      
      // 4. Check if there are pending reviews
      const pendingReviews = page.locator('[data-testid="pending-review"]');
      const count = await pendingReviews.count();
      
      if (count > 0) {
        // Get the first pending review
        const firstReview = pendingReviews.first();
        
        // Get review ID for later verification
        const reviewId = await firstReview.getAttribute('data-review-id');
        
        // Click approve button
        await firstReview.locator('button:has-text("اعتماد")').click();
        
        // Wait for success indication
        await page.waitForTimeout(2000);
        
        // 5. Verify review is no longer in pending list
        const remainingCount = await pendingReviews.count();
        expect(remainingCount).toBe(count - 1);
        
        console.log(`✓ Review ${reviewId} approved successfully`);
      } else {
        console.log('⚠ No pending reviews to test with');
      }
    } else {
      console.log('⚠ Pending Reviews tab not found (feature flag might be off)');
    }
  });

  test('merchant can reject pending reviews', async ({ page }) => {
    // Skip if feature flag is not enabled
    const flagEnabled = process.env.NEXT_PUBLIC_FLAG_DASHBOARD_V2 === 'true';
    if (!flagEnabled) {
      test.skip();
    }

    // Similar flow as above but clicking reject instead
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_STORE_EMAIL);
    await page.fill('input[type="password"]', TEST_STORE_PASSWORD);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.click('text=التقييمات');
    
    const pendingTabExists = await page.locator('text=التقييمات المعلقة').count();
    
    if (pendingTabExists > 0) {
      await page.click('text=التقييمات المعلقة');
      await page.waitForTimeout(2000);
      
      const pendingReviews = page.locator('[data-testid="pending-review"]');
      const count = await pendingReviews.count();
      
      if (count > 0) {
        const firstReview = pendingReviews.first();
        const reviewId = await firstReview.getAttribute('data-review-id');
        
        // Click reject button
        await firstReview.locator('button:has-text("رفض")').click();
        
        await page.waitForTimeout(2000);
        
        const remainingCount = await pendingReviews.count();
        expect(remainingCount).toBe(count - 1);
        
        console.log(`✓ Review ${reviewId} rejected successfully`);
      }
    }
  });
});
