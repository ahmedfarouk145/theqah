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
    viewCount: number;
}

export type BlogPostInput = Omit<BlogPost, "id" | "createdAt" | "updatedAt" | "viewCount" | "publishedAt">;

export const BLOG_CATEGORIES = [
    "نصائح للتجار",
    "أخبار المنصة",
    "دليل الاستخدام",
    "التجارة الإلكترونية",
    "تقييمات وثقة",
    "قصص نجاح",
] as const;
