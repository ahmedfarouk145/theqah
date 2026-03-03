/**
 * Subscription date normalization helpers.
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SECONDS_EPOCH = 1_000_000_000;
const MAX_SECONDS_EPOCH = 9_999_999_999;

function normalizeEpochMs(value: number): number {
    if (value >= MIN_SECONDS_EPOCH && value <= MAX_SECONDS_EPOCH) {
        return value * 1000;
    }
    return value;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Parse date-like value into epoch milliseconds.
 * Supports: epoch seconds/ms, ISO datetime strings, and YYYY-MM-DD (start of day UTC).
 */
export function parseDateToEpochMs(value: unknown): number | null {
    const numeric = toFiniteNumber(value);
    if (numeric !== null) return normalizeEpochMs(numeric);

    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = DATE_ONLY_PATTERN.test(trimmed)
        ? `${trimmed}T00:00:00.000Z`
        : trimmed;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse subscription end date into epoch milliseconds.
 * For YYYY-MM-DD values, this returns end-of-day UTC.
 */
export function parseEndDateToEpochMs(value: unknown): number | null {
    if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value.trim())) {
        const parsed = Date.parse(`${value.trim()}T23:59:59.999Z`);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return parseDateToEpochMs(value);
}

function pickFirstDateLike(
    source: Record<string, unknown> | null | undefined,
    keys: string[]
): unknown {
    if (!source) return null;

    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) {
            return source[key];
        }
    }

    return null;
}

/**
 * Extract normalized start date from Salla subscription-like payload.
 */
export function extractSubscriptionStartedAt(payload: Record<string, unknown> | null | undefined): number | null {
    const nestedSubscription =
        payload && typeof payload.subscription === 'object' && payload.subscription !== null
            ? (payload.subscription as Record<string, unknown>)
            : null;
    const nestedPlan =
        payload && typeof payload.plan === 'object' && payload.plan !== null
            ? (payload.plan as Record<string, unknown>)
            : null;

    const candidate =
        pickFirstDateLike(payload, ['start_date', 'started_at', 'created_at']) ??
        pickFirstDateLike(nestedSubscription, ['start_date', 'started_at', 'created_at']) ??
        pickFirstDateLike(nestedPlan, ['start_date', 'started_at', 'created_at']);

    return parseDateToEpochMs(candidate);
}

/**
 * Extract normalized end date from Salla subscription-like payload.
 */
export function extractSubscriptionExpiresAt(payload: Record<string, unknown> | null | undefined): number | null {
    const nestedSubscription =
        payload && typeof payload.subscription === 'object' && payload.subscription !== null
            ? (payload.subscription as Record<string, unknown>)
            : null;
    const nestedPlan =
        payload && typeof payload.plan === 'object' && payload.plan !== null
            ? (payload.plan as Record<string, unknown>)
            : null;

    const candidate =
        pickFirstDateLike(payload, ['end_date', 'expires_at', 'expired_at', 'ends_at']) ??
        pickFirstDateLike(nestedSubscription, ['end_date', 'expires_at', 'expired_at', 'ends_at']) ??
        pickFirstDateLike(nestedPlan, ['end_date', 'expires_at', 'expired_at', 'ends_at']);

    return parseEndDateToEpochMs(candidate);
}
