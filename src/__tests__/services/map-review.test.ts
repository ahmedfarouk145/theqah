import { describe, expect, it } from 'vitest';
import { mapReview } from '@/utils/mapReview';

const NOW = Date.UTC(2026, 2, 28, 13, 0, 0);

describe('mapReview', () => {
  it('treats approved reviews as published for admin listings', () => {
    const review = mapReview(
      'review-1',
      {
        author: {
          displayName: 'عميل متجر',
        },
        text: 'تجربة ممتازة',
        stars: 5,
        status: 'approved',
        verified: true,
        createdAt: NOW,
      },
      'متجر الثقة',
      'https://theqah.store',
    );

    expect(review.published).toBe(true);
    expect(review.trustedBuyer).toBe(true);
    expect(review.storeDomain).toBe('https://theqah.store');
  });
});
