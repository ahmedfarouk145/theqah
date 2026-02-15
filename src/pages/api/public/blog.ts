// src/pages/api/public/blog.ts
// Public API: list published blog posts (no auth required)
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "method not allowed" });
    }

    const { category, tag, page = "1", limit: lim = "9" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = Math.min(20, Math.max(1, parseInt(lim as string, 10) || 9));

    let q = dbAdmin()
        .collection("blog_posts")
        .where("status", "==", "published")
        .orderBy("publishedAt", "desc");

    if (category && typeof category === "string") {
        q = q.where("category", "==", category);
    }

    // Firestore doesn't support array-contains + orderBy with different fields easily,
    // so we filter tags in-memory for simplicity
    const snap = await q.limit(100).get();

    let posts = snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            slug: data.slug,
            title: data.title,
            excerpt: data.excerpt,
            coverImage: data.coverImage || null,
            author: data.author,
            category: data.category,
            tags: data.tags || [],
            publishedAt: data.publishedAt,
            viewCount: data.viewCount || 0,
        };
    });

    // Filter by tag in-memory if needed
    if (tag && typeof tag === "string") {
        posts = posts.filter((p) => p.tags.includes(tag));
    }

    const total = posts.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (pageNum - 1) * pageSize;
    const paginated = posts.slice(start, start + pageSize);

    // Cache for 60s
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");

    return res.json({
        posts: paginated,
        pagination: { page: pageNum, pageSize, total, totalPages },
    });
}
