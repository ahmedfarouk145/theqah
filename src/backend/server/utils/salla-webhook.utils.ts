/**
 * Salla Webhook Utilities
 * @module server/utils/salla-webhook.utils
 */

import type { NextApiRequest } from "next";
import crypto from "crypto";
import type { Dict, SallaItem } from "../types/salla-webhook.types";

/* ===================== Env ===================== */
const WEBHOOK_SECRET = (process.env.SALLA_WEBHOOK_SECRET || "").trim();
const WEBHOOK_TOKEN = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();

/* ===================== Basic Utils ===================== */
export const lc = (x: unknown) => String(x ?? "").toLowerCase();

export function getHeader(req: NextApiRequest, name: string): string {
    const v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? (v[0] || "") : (v || "");
}

export function readRawBody(req: NextApiRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

export function timingSafeEq(a: string, b: string): boolean {
    try {
        const A = Buffer.from(a, "utf8"), B = Buffer.from(b, "utf8");
        if (A.length !== B.length) return false;
        return crypto.timingSafeEqual(A, B);
    } catch { return false; }
}

/* ===================== Security ===================== */
export function verifySignature(raw: Buffer, req: NextApiRequest): boolean {
    const sigHeader = getHeader(req, "x-salla-signature");
    if (!WEBHOOK_SECRET || !sigHeader) return false;
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
    return timingSafeEq(sigHeader, expected);
}

export function extractProvidedToken(req: NextApiRequest): string {
    const auth = getHeader(req, "authorization").trim();
    if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    return getHeader(req, "x-salla-token").trim()
        || getHeader(req, "x-webhook-token").trim()
        || (typeof req.query.t === "string" ? req.query.t.trim() : "");
}

export function verifyToken(req: NextApiRequest): boolean {
    const provided = extractProvidedToken(req);
    return !!WEBHOOK_TOKEN && !!provided && timingSafeEq(provided, WEBHOOK_TOKEN);
}

export function verifySallaRequest(req: NextApiRequest, raw: Buffer): { ok: boolean; strategy: "signature" | "token" | "none" } {
    const strategy = lc(getHeader(req, "x-salla-security-strategy") || "");
    if (strategy === "signature") return { ok: verifySignature(raw, req), strategy: "signature" };
    if (strategy === "token") return { ok: verifyToken(req), strategy: "token" };
    if (verifySignature(raw, req)) return { ok: true, strategy: "signature" };
    if (verifyToken(req)) return { ok: true, strategy: "token" };
    return { ok: false, strategy: "none" };
}

/* ===================== Domain Helpers ===================== */
export function toDomainBase(domain: string | null | undefined): string | null {
    if (!domain) return null;
    try {
        const u = new URL(String(domain));
        const origin = u.origin.toLowerCase();
        const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
        return firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
    } catch { return null; }
}

export function normalizeUrl(url: string): URL | null {
    try {
        return new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
        return null;
    }
}

export function encodeUrlForFirestore(url: string | null | undefined): string {
    if (!url) return "";
    return url
        .replace(/:/g, "_COLON_")
        .replace(/\//g, "_SLASH_")
        .replace(/\?/g, "_QUEST_")
        .replace(/#/g, "_HASH_")
        .replace(/&/g, "_AMP_");
}

export function pickStoreUidFromSalla(eventData: Dict, bodyMerchant?: string | number): string | undefined {
    if (bodyMerchant !== undefined && bodyMerchant !== null) return `salla:${String(bodyMerchant)}`;
    const store = eventData["store"] as Dict | undefined;
    const merchant = eventData["merchant"] as Dict | undefined;
    const sid = store?.["id"] ?? merchant?.["id"];
    return sid !== undefined ? `salla:${String(sid)}` : undefined;
}

export const keyOf = (event: string, orderId?: string, status?: string) =>
    `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

/* ===================== Data Extraction ===================== */
export function extractProductIds(items?: SallaItem[]): string[] {
    if (!Array.isArray(items)) return [];
    const ids = new Set<string>();
    for (const it of items) {
        const raw = it?.product_id ?? it?.product?.id ?? it?.id;
        if (raw !== undefined && raw !== null) ids.add(String(raw));
    }
    return [...ids];
}

export function extractAllProductNames(items?: SallaItem[]): string[] {
    if (!Array.isArray(items) || !items.length) return [];
    const names: string[] = [];
    for (const item of items) {
        const name = item?.name || item?.product?.name || item?.product_name || item?.title;
        if (typeof name === 'string' && name.trim()) {
            names.push(name.trim());
        }
    }
    return names;
}

/* ===================== Idempotency ===================== */
export function generateIdempotencyKey(sigHeader: string, raw: Buffer): string {
    return crypto.createHash("sha256").update(sigHeader + "|").update(raw).digest("hex");
}
