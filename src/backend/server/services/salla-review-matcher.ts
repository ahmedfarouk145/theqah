/**
 * Pure matching/disambiguation logic for the Salla review-id backfill.
 *
 * Why this exists: Salla's `/admin/v2/reviews` API (a) ignores all filters
 * (every query returns the full store list) and (b) returns review items with
 * NO product field. So a saved product-review can only be located by scanning
 * and matching on `order_id`. When one order has multiple product reviews, the
 * API gives several candidates that `order_id` alone cannot disambiguate.
 *
 * This module decides, given an order's candidate API entries, which one (if
 * any) uniquely corresponds to our review — and crucially, returns `null`
 * rather than guessing when the data is genuinely ambiguous (e.g. a customer
 * left several empty-text, same-rating reviews in one order). A wrong guess
 * would seal the wrong product's review, so "no match" is the safe outcome.
 */

export interface MatchTarget {
  stars: number;
  text: string | null | undefined;
}

export interface MatchCandidate {
  id: string;
  rating: number;
  content: string | null | undefined;
}

export function normalizeText(text: string | null | undefined): string {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Returns the candidate id that uniquely matches the target, or null if the
 * order's candidates cannot be disambiguated to exactly one.
 * Caller must pre-filter `candidates` to the target's order_id + product-review type.
 */
export function pickUniqueMatch(target: MatchTarget, candidates: MatchCandidate[]): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const targetText = normalizeText(target.text);

  if (targetText) {
    const textMatches = candidates.filter((c) => normalizeText(c.content) === targetText);
    if (textMatches.length === 1) return textMatches[0].id;
    if (textMatches.length > 1) {
      const byRating = textMatches.filter((c) => c.rating === target.stars);
      return byRating.length === 1 ? byRating[0].id : null;
    }
    // Target has text but nothing matches it — refuse to guess.
    return null;
  }

  // Empty target text: the only remaining signal is rating.
  const byRating = candidates.filter((c) => c.rating === target.stars);
  return byRating.length === 1 ? byRating[0].id : null;
}

export interface CursorState {
  nextPage: number;
  pass: number;
}

export interface CursorResult extends CursorState {
  passCompleted: boolean;
  gaveUp: boolean;
}

/**
 * Advances a per-store scan cursor after scanning `pagesScanned` pages.
 * When the cursor passes `totalPages`, a full pass completed: reset to page 1
 * and increment `pass`. Once `pass` reaches `maxPasses`, flag give-up so the
 * caller can retire still-unmatched reviews instead of looping forever.
 */
export function advanceCursor(
  state: CursorState,
  pagesScanned: number,
  totalPages: number,
  maxPasses: number,
): CursorResult {
  const reached = state.nextPage + pagesScanned > totalPages;
  if (!reached) {
    return { nextPage: state.nextPage + pagesScanned, pass: state.pass, passCompleted: false, gaveUp: false };
  }
  const pass = state.pass + 1;
  return { nextPage: 1, pass, passCompleted: true, gaveUp: pass >= maxPasses };
}
