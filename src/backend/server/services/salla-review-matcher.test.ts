import { describe, it, expect } from 'vitest';
import { pickUniqueMatch, advanceCursor } from './salla-review-matcher';

describe('pickUniqueMatch', () => {
  it('returns null when there are no candidates', () => {
    expect(pickUniqueMatch({ stars: 5, text: 'حلو' }, [])).toBeNull();
  });

  it('returns the only candidate when there is exactly one', () => {
    expect(pickUniqueMatch({ stars: 5, text: '' }, [{ id: 'A', rating: 5, content: '' }])).toBe('A');
  });

  it('disambiguates multiple candidates by exact normalized text', () => {
    const cands = [
      { id: 'A', rating: 5, content: 'ممتاز جدا' },
      { id: 'B', rating: 5, content: 'سيئ' },
    ];
    expect(pickUniqueMatch({ stars: 5, text: '  ممتاز   جدا ' }, cands)).toBe('A');
  });

  it('returns null when multiple candidates have empty text + same rating (genuinely ambiguous)', () => {
    const cands = [
      { id: 'A', rating: 5, content: '' },
      { id: 'B', rating: 5, content: '' },
    ];
    expect(pickUniqueMatch({ stars: 5, text: '' }, cands)).toBeNull();
  });

  it('uses rating as a tiebreak among identical-text candidates', () => {
    const cands = [
      { id: 'A', rating: 4, content: 'جيد' },
      { id: 'B', rating: 5, content: 'جيد' },
    ];
    expect(pickUniqueMatch({ stars: 5, text: 'جيد' }, cands)).toBe('B');
  });

  it('returns null when target has text but no candidate text matches (do not guess)', () => {
    const cands = [
      { id: 'A', rating: 5, content: 'شيء اخر' },
      { id: 'B', rating: 5, content: 'مختلف' },
    ];
    expect(pickUniqueMatch({ stars: 5, text: 'النص الحقيقي' }, cands)).toBeNull();
  });

  it('disambiguates empty-text target by unique rating', () => {
    const cands = [
      { id: 'A', rating: 3, content: '' },
      { id: 'B', rating: 5, content: '' },
    ];
    expect(pickUniqueMatch({ stars: 5, text: '' }, cands)).toBe('B');
  });
});

describe('advanceCursor', () => {
  it('advances within a pass without completing it', () => {
    const r = advanceCursor({ nextPage: 1, pass: 0 }, 100, 287, 3);
    expect(r).toEqual({ nextPage: 101, pass: 0, passCompleted: false, gaveUp: false });
  });

  it('completes a pass and resets to page 1 when reaching the end', () => {
    const r = advanceCursor({ nextPage: 201, pass: 0 }, 100, 287, 3);
    expect(r.nextPage).toBe(1);
    expect(r.pass).toBe(1);
    expect(r.passCompleted).toBe(true);
    expect(r.gaveUp).toBe(false);
  });

  it('flags give-up once max passes are reached', () => {
    const r = advanceCursor({ nextPage: 250, pass: 2 }, 100, 287, 3);
    expect(r.pass).toBe(3);
    expect(r.passCompleted).toBe(true);
    expect(r.gaveUp).toBe(true);
  });
});
