// src/backend/server/utils/fetch.ts
/**
 * C8: Fetch with Timeout Utility
 * Prevents external API calls from hanging indefinitely
 */

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'signal'> {
    timeoutMs?: number;
}

/**
 * Fetch with automatic timeout
 * @param url - URL to fetch
 * @param options - Standard fetch options plus timeoutMs
 * @returns Response or throws on timeout/error
 * 
 * @example
 * const res = await fetchWithTimeout('https://api.salla.dev/...', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 *   timeoutMs: 15000,
 * });
 */
export async function fetchWithTimeout(
    url: string,
    options: FetchWithTimeoutOptions = {}
): Promise<Response> {
    const { timeoutMs = 20000, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
        });
        return response;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Fetch JSON with timeout and error handling
 */
export async function fetchJsonWithTimeout<T = unknown>(
    url: string,
    options: FetchWithTimeoutOptions = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
    try {
        const response = await fetchWithTimeout(url, options);

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            return {
                ok: false,
                error: errorText || `HTTP ${response.status}`,
                status: response.status,
            };
        }

        const data = await response.json() as T;
        return { ok: true, data };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: message };
    }
}

/**
 * Timeout presets for common use cases
 */
export const TimeoutPresets = {
    /** Quick API calls (5 seconds) */
    FAST: 5000,
    /** Standard API calls (15 seconds) */
    STANDARD: 15000,
    /** Long-running operations (30 seconds) */
    LONG: 30000,
    /** Very long operations (60 seconds) */
    EXTENDED: 60000,
};

export default fetchWithTimeout;
