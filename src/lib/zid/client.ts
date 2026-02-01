// src/lib/zid/client.ts
// Zid API client for making authenticated requests

const ZID_API_URL = process.env.ZID_API_URL || 'https://api.zid.sa/v1';

export interface ZidReview {
    id: number;
    product_id: number;
    product_name?: string;
    rating: number;
    comment: string;
    status: 'pending' | 'approved' | 'rejected' | 'published';
    customer: {
        id: number;
        name: string;
        email?: string;
        mobile?: string;
    };
    created_at: string;
    updated_at: string;
}

export interface ZidReviewsResponse {
    reviews?: ZidReview[];
    data?: ZidReview[];
    pagination?: {
        current_page: number;
        total_pages: number;
        total: number;
        per_page: number;
    };
    meta?: {
        current_page: number;
        last_page: number;
        total: number;
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
        product_id: number;
        name?: string;
        quantity?: number;
        price?: number;
    }>;
    total?: number;
    currency?: string;
    created_at?: string;
}

/**
 * Fetch product reviews from Zid API
 * Endpoint: GET /v1/managers/store/reviews/product/
 * Scope required: products.read
 */
export async function fetchZidReviews(
    managerToken: string,
    params?: {
        status?: string;
        page?: number;
        per_page?: number;
        page_size?: number;
        date_from?: string;
        date_to?: string;
        customer_id?: string | number;
        sort_by?: string;
        order_by?: 'asc' | 'desc';
    }
): Promise<ZidReviewsResponse> {
    const url = new URL(`${ZID_API_URL}/managers/store/reviews/product/`);

    if (params) {
        if (params.status) url.searchParams.set('status', params.status);
        if (params.page) url.searchParams.set('page', String(params.page));
        if (params.per_page) url.searchParams.set('per_page', String(params.per_page));
        if (params.page_size) url.searchParams.set('page_size', String(params.page_size));
        if (params.date_from) url.searchParams.set('date_from', params.date_from);
        if (params.date_to) url.searchParams.set('date_to', params.date_to);
        if (params.customer_id) url.searchParams.set('customer_id', String(params.customer_id));
        if (params.sort_by) url.searchParams.set('sort_by', params.sort_by);
        if (params.order_by) url.searchParams.set('order_by', params.order_by);
    }

    const response = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${managerToken}`,
            'X-MANAGER-TOKEN': managerToken,
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Zid API error ${response.status}: ${error}`);
    }

    return response.json();
}

/**
 * Get new reviews count
 * Endpoint: GET /v1/managers/store/reviews/count/{status}
 */
export async function fetchZidReviewsCount(
    managerToken: string,
    status: string = 'pending'
): Promise<number> {
    const response = await fetch(
        `${ZID_API_URL}/managers/store/reviews/count/${status}`,
        {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'X-MANAGER-TOKEN': managerToken,
                'Accept': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Zid API error ${response.status}`);
    }

    const data = await response.json();
    return data.count ?? data.total ?? 0;
}

/**
 * Fetch store/manager profile
 * Endpoint: GET /v1/managers/account/profile
 */
export async function fetchZidStoreInfo(
    managerToken: string
): Promise<ZidStoreInfo | null> {
    try {
        const response = await fetch(
            `${ZID_API_URL}/managers/account/profile`,
            {
                headers: {
                    'Authorization': `Bearer ${managerToken}`,
                    'X-MANAGER-TOKEN': managerToken,
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        return data?.store || data || null;
    } catch (err) {
        console.error('Failed to fetch Zid store info:', err);
        return null;
    }
}

/**
 * Fetch orders list
 * Endpoint: GET /v1/managers/store/orders
 */
export async function fetchZidOrders(
    managerToken: string,
    params?: {
        page?: number;
        per_page?: number;
        status?: string;
        date_from?: string;
        date_to?: string;
    }
): Promise<ZidOrder[]> {
    const url = new URL(`${ZID_API_URL}/managers/store/orders`);

    if (params) {
        if (params.page) url.searchParams.set('page', String(params.page));
        if (params.per_page) url.searchParams.set('per_page', String(params.per_page));
        if (params.status) url.searchParams.set('status', params.status);
        if (params.date_from) url.searchParams.set('date_from', params.date_from);
        if (params.date_to) url.searchParams.set('date_to', params.date_to);
    }

    const response = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${managerToken}`,
            'X-MANAGER-TOKEN': managerToken,
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Zid API error ${response.status}`);
    }

    const data = await response.json();
    return data.orders ?? data.data ?? [];
}
