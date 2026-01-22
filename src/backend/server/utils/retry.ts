// src/backend/server/utils/retry.ts
/**
 * H9: Retry Utility for SMS and External API Calls
 * Provides retry logic with exponential backoff
 */

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableErrors?: string[];
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryableErrors' | 'onRetry'>> = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
};

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;
    let delay = opts.initialDelayMs;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if error is retryable
            if (opts.retryableErrors && opts.retryableErrors.length > 0) {
                const isRetryable = opts.retryableErrors.some(
                    (pattern) => lastError?.message?.includes(pattern)
                );
                if (!isRetryable) {
                    throw lastError;
                }
            }

            // Don't retry on last attempt
            if (attempt >= opts.maxAttempts) {
                break;
            }

            // Calculate next delay with jitter
            const jitter = Math.random() * 0.3 * delay;
            const nextDelay = Math.min(delay + jitter, opts.maxDelayMs);

            // Call onRetry callback
            if (opts.onRetry) {
                opts.onRetry(attempt, lastError, nextDelay);
            }

            // Wait before retry
            await sleep(nextDelay);

            // Increase delay for next attempt
            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
        }
    }

    throw lastError || new Error("Retry failed with unknown error");
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry SMS sending with exponential backoff
 */
export async function retrySms<T>(
    sendFn: () => Promise<T>,
    options?: Partial<RetryOptions>
): Promise<T> {
    return withRetry(sendFn, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        retryableErrors: [
            "timeout",
            "ETIMEDOUT",
            "ECONNRESET",
            "ENOTFOUND",
            "oursms_http_5",  // 5xx errors
            "ESOCKETTIMEDOUT",
            "network",
        ],
        ...options,
    });
}

/**
 * Retry webhook delivery with exponential backoff
 */
export async function retryWebhook<T>(
    deliverFn: () => Promise<T>,
    options?: Partial<RetryOptions>
): Promise<T> {
    return withRetry(deliverFn, {
        maxAttempts: 3,
        initialDelayMs: 2000,
        maxDelayMs: 30000,
        backoffMultiplier: 3,
        retryableErrors: [
            "timeout",
            "ETIMEDOUT",
            "ECONNRESET",
            "429",  // Rate limited
            "502",
            "503",
            "504",
        ],
        ...options,
    });
}

export default withRetry;
