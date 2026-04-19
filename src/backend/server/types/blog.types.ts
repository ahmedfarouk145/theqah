// src/backend/server/types/blog.types.ts
import type { Timestamp } from "firebase-admin/firestore";

export interface BlogPost {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string;           // HTML from TipTap editor
    coverImage?: string | null;
    author: string;
    category: string;
    tags: string[];
    status: "draft" | "published";
    publishedAt?: Timestamp | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    seoTitle?: string | null;
    seoDescription?: string | null;
    /** Custom canonical host for this post (e.g. "blog.example.com"). Null = use site default. */
    domain?: string | null;
    viewCount: number;
}

export type BlogPostInput = Omit<BlogPost, "id" | "createdAt" | "updatedAt" | "viewCount" | "publishedAt">;

/**
 * Normalize a user-supplied domain into a bare host (e.g. "blog.example.com").
 * Strips protocol, trailing slashes, whitespace, and any path/query. Returns
 * `null` for empty input or values that don't look like a host.
 */
export function normalizeDomain(input: unknown): string | null {
    if (typeof input !== "string") return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    const stripped = trimmed
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .replace(/:\d+$/, "")
        .toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(stripped)) return null;
    return stripped;
}

export const BLOG_CATEGORIES = [
    "نصائح للتجار",
    "أخبار المنصة",
    "دليل الاستخدام",
    "التجارة الإلكترونية",
    "تقييمات وثقة",
    "قصص نجاح",
] as const;
