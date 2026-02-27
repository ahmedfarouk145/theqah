// src/lib/zid/client.ts
// Zid API client — aligned with actual Zid API schema
// Important: Zid uses DUAL tokens - access_token as X-Manager-Token, authorization as Authorization Bearer

const ZID_API_URL = process.env.ZID_API_URL || 'https://api.zid.sa/v1';

// ── Types matching actual Zid API response ──────────────────

/** Review from Zid API — actual schema with UUID IDs */
export interface ZidReview {
    id: string;                // UUID
    customer: {
        id: number;
        name: string;
    };
    product: {
        id: string;            // UUID
        name: string;
        bought_this_item: boolean;
        image: string | null;
    };
    status: 'pending' | 'approved' | 'rejected' | 'published';
    is_anonymous: boolean;
    rating: number;
    comment: string;
    edit_requested: boolean;
    original_snapshot: unknown | null;
    reply: string | null;
    images: string[];
    created_at: string;
    updated_at: string;
}

/** Zid List Reviews API response */
export interface ZidReviewsResponse {
    status: string;
    pagination: {
        page: number;
        next_page: number | null;
        last_page: number;
        result_count: number;
    };
    reviews: ZidReview[];
    message: {
        type: string;
        code: string | null;
        name: string | null;
        description: string | null;
    };
}

export interface ZidStoreInfo {
    id?: string | number;
    name?: string;
    email?: string;
    mobile?: string;
    domain?: string;
    url?: string;
    logo?: string;
    description?: string;
}

export interface ZidOrder {
    id: number | string;
    number?: string;
    status: string;
    customer?: {
        id?: number;
        name?: string;
        email?: string;
        mobile?: string;
    };
    items?: Array<{
        product_id: number | string;
        name?: string;
        quantity?: number;
        price?: number;
    }>;
    total?: number;
    currency?: string;
    created_at?: string;
}

// ── Auth headers helper ─────────────────────────────────────

/** Build Zid auth headers — supports both single-token and dual-token modes */
function zidHeaders(tokens: { access_token: string; authorization?: string }): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Accept-Language': 'ar',
    };

    if (tokens.authorization) {
        // Dual-token mode (proper Zid auth)
        headers['Authorization'] = `Bearer ${tokens.authorization}`;
        headers['X-Manager-Token'] = tokens.access_token;
    } else {
        // Fallback: single manager token
        headers['Authorization'] = `Bearer ${tokens.access_token}`;
        headers['X-Manager-Token'] = tokens.access_token;
    }

    return headers;
}

// ── API Functions ───────────────────────────────────────────

/**
 * Fetch product reviews from Zid API
 * GET /v1/managers/store/reviews/product
 * Uses page_size (not per_page), response has next_page/last_page
 */
export async function fetchZidReviews(
    tokens: { access_token: string; authorization?: string },
    params?: {
        status?: string;
        page?: number;
        page_size?: number;
        date_from?: string;
        date_to?: string;
        search_term?: string;
        order_by?: string;
        sort_by?: 'ASC' | 'DESC';
    }
): Promise<ZidReviewsResponse> {
    const url = new URL(`${ZID_API_URL}/managers/store/reviews/product`);

    if (params) {
        if (params.status) url.searchParams.set('status', params.status);
        if (params.page) url.searchParams.set('page', String(params.page));
        if (params.page_size) url.searchParams.set('page_size', String(params.page_size));
        if (params.date_from) url.searchParams.set('date_from', params.date_from);
        if (params.date_to) url.searchParams.set('date_to', params.date_to);
        if (params.search_term) url.searchParams.set('search_term', params.search_term);
        if (params.order_by) url.searchParams.set('order_by', params.order_by);
        if (params.sort_by) url.searchParams.set('sort_by', params.sort_by);
    }

    const response = await fetch(url.toString(), {
        headers: zidHeaders(tokens),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Zid API error ${response.status}: ${error}`);
    }

    return response.json();
}

/**
 * Get new reviews count
 * GET /v1/managers/store/reviews/count/{status}
 */
export async function fetchZidReviewsCount(
    tokens: { access_token: string; authorization?: string },
    status: string = 'pending'
): Promise<number> {
    const response = await fetch(
        `${ZID_API_URL}/managers/store/reviews/count/${status}`,
        { headers: zidHeaders(tokens) }
    );

    if (!response.ok) {
        throw new Error(`Zid API error ${response.status}`);
    }

    const data = await response.json();
    return data.count ?? data.total ?? 0;
}

/**
 * Fetch store/manager profile
 * GET /v1/managers/account/profile
 */
export async function fetchZidStoreInfo(
    tokens: { access_token: string; authorization?: string }
): Promise<ZidStoreInfo | null> {
    try {
        const response = await fetch(
            `${ZID_API_URL}/managers/account/profile`,
            { headers: zidHeaders(tokens) }
        );

        if (!response.ok) return null;

        const data = await response.json();
        return data?.store || data || null;
    } catch (err) {
        console.error('[ZID_CLIENT] Failed to fetch store info:', err);
        return null;
    }
}

/**
 * Fetch orders list
 * GET /v1/managers/store/orders
 */
export async function fetchZidOrders(
    tokens: { access_token: string; authorization?: string },
    params?: {
        page?: number;
        page_size?: number;
        status?: string;
        date_from?: string;
        date_to?: string;
    }
): Promise<ZidOrder[]> {
    const url = new URL(`${ZID_API_URL}/managers/store/orders`);

    if (params) {
        if (params.page) url.searchParams.set('page', String(params.page));
        if (params.page_size) url.searchParams.set('page_size', String(params.page_size));
        if (params.status) url.searchParams.set('status', params.status);
        if (params.date_from) url.searchParams.set('date_from', params.date_from);
        if (params.date_to) url.searchParams.set('date_to', params.date_to);
    }

    const response = await fetch(url.toString(), {
        headers: zidHeaders(tokens),
    });

    if (!response.ok) {
        throw new Error(`Zid API error ${response.status}`);
    }

    const data = await response.json();
    return data.orders ?? data.data ?? [];
}
