// src/backend/server/enrichment/build-consensus.test.ts
import { describe, it, expect } from 'vitest';
import { buildConsensusPrompt, shouldRegenerate } from './build-consensus';

describe('buildConsensusPrompt', () => {
  it('embeds review texts and instructs verified framing', () => {
    const p = buildConsensusPrompt('حذاء رياضي', [
      { stars: 5, text: 'خفيف وممتاز للجري' },
      { stars: 4, text: 'مريح لكن المقاس صغير' },
    ]);
    expect(p).toContain('خفيف وممتاز للجري');
    expect(p).toContain('المشترون الموثقون');
  });
});

describe('shouldRegenerate', () => {
  it('regenerates when no consensus exists yet', () => {
    expect(shouldRegenerate(null, 3)).toBe(true);
  });
  it('regenerates when review count grew by >=20%', () => {
    expect(shouldRegenerate({ basedOnCount: 10 }, 12)).toBe(true);
  });
  it('does NOT regenerate for tiny changes', () => {
    expect(shouldRegenerate({ basedOnCount: 10 }, 11)).toBe(false);
  });
  it('never generates below the minimum review threshold', () => {
    expect(shouldRegenerate(null, 2)).toBe(false);
  });
});
