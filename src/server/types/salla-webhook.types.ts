/**
 * Salla Webhook Types
 * @module server/types/salla-webhook.types
 */

export type Dict = Record<string, unknown>;

export interface SallaCustomer {
    name?: string;
    email?: string;
    mobile?: string | number;
}

export interface SallaItem {
    id?: string | number;
    product?: { id?: string | number; name?: string } | null;
    product_id?: string | number;
    name?: string;
    product_name?: string;
    title?: string;
}

export interface SallaOrder {
    id?: string | number;
    order_id?: string | number;
    reference_id?: string | number;
    number?: string | number;
    status?: string;
    order_status?: string;
    new_status?: string;
    shipment_status?: string;
    payment_status?: string;
    customer?: SallaCustomer;
    items?: SallaItem[];
    store?: { id?: string | number; name?: string; domain?: string; url?: string } | null;
    merchant?: { id?: string | number; name?: string; domain?: string; url?: string } | null;
}

export interface SallaWebhookBody {
    event: string;
    merchant?: string | number;
    data?: SallaOrder | Dict;
    created_at?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface WebhookLogEntry {
    level: LogLevel;
    scope: string;
    msg: string;
    event?: string | null;
    idemKey?: string | null;
    merchant?: string | number | null;
    orderId?: string | null;
    meta?: Dict;
}
