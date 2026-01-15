/**
 * Verification Reason Utilities
 * 
 * Provides utilities for determining and managing review verification reasons
 */

export type VerifiedReason = 
  | 'subscription_date'      // Review created after subscription start
  | 'manual_verification'    // Manually verified by admin
  | 'auto_verified'          // Auto-verified by system rules
  | 'salla_native'           // Native Salla review (trusted)
  | 'invited_purchase'       // From our invite system with order verification
  | null;                    // Not verified

/**
 * Determine verification reason based on review context
 */
export function determineVerifiedReason(context: {
  hasToken?: boolean;
  source?: string;
  subscriptionStart?: number;
  reviewDate?: number;
  manuallyVerified?: boolean;
}): VerifiedReason {
  const { hasToken, source, subscriptionStart, reviewDate, manuallyVerified } = context;

  // Manual verification by admin takes precedence
  if (manuallyVerified) {
    return 'manual_verification';
  }

  // From our invite system with token
  if (hasToken) {
    return 'invited_purchase';
  }

  // Native Salla reviews are trusted
  if (source === 'salla_native' || source === 'salla') {
    return 'salla_native';
  }

  // Check subscription date verification
  if (subscriptionStart && reviewDate && reviewDate >= subscriptionStart) {
    return 'subscription_date';
  }

  // System auto-verification rules
  // (Add custom rules here as needed)

  // Not verified
  return null;
}

/**
 * Get human-readable explanation for verification reason
 */
export function getVerifiedReasonLabel(reason: VerifiedReason, locale: 'en' | 'ar' = 'ar'): string {
  if (!reason) {
    return locale === 'ar' ? 'غير موثق' : 'Not Verified';
  }

  const labels = {
    subscription_date: {
      ar: 'تقييم بعد الاشتراك',
      en: 'Review after subscription',
    },
    manual_verification: {
      ar: 'تم التحقق يدوياً',
      en: 'Manually verified',
    },
    auto_verified: {
      ar: 'تم التحقق تلقائياً',
      en: 'Auto-verified',
    },
    salla_native: {
      ar: 'تقييم سلة أصلي',
      en: 'Native Salla review',
    },
    invited_purchase: {
      ar: 'تقييم عملية شراء موثقة',
      en: 'Verified purchase review',
    },
  };

  return labels[reason]?.[locale] || reason;
}

/**
 * Check if a verification reason indicates a trusted review
 */
export function isTrustedVerification(reason: VerifiedReason): boolean {
  return reason !== null && [
    'invited_purchase',
    'manual_verification',
    'salla_native',
  ].includes(reason);
}

/**
 * Update review verification status
 * Returns updated fields to merge into review document
 */
export function updateVerification(
  currentReason: VerifiedReason,
  newReason: VerifiedReason,
  adminId?: string
): { verified: boolean; verifiedReason: VerifiedReason; verifiedBy?: string; verifiedAt?: number } {
  const isVerified = newReason !== null;

  const updates: ReturnType<typeof updateVerification> = {
    verified: isVerified,
    verifiedReason: newReason,
  };

  // Track admin who verified
  if (newReason === 'manual_verification' && adminId) {
    updates.verifiedBy = adminId;
    updates.verifiedAt = Date.now();
  }

  return updates;
}
