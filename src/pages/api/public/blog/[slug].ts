// src/pages/api/public/blog/[slug].ts
// Public API: get a single published blog post by slug
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "method not allowed" });
    }

    const { slug } = req.query;
    if (!slug || typeof slug !== "string") {
        return res.status(400).json({ error: "missing slug" });
    }

    const snap = await dbAdmin()
        .collection("blog_posts")
        .where("slug", "==", slug)
        .where("status", "==", "published")
        .limit(1)
        .get();

    if (snap.empty) {
        return res.status(404).json({ error: "post not found" });
    }

    const doc = snap.docs[0];
    const data = doc.data();

    // Increment view count (fire & forget)
    doc.ref.update({ viewCount: FieldValue.increment(1) }).catch(() => { });

    // Cache for 60s
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");

    return res.json({
        id: doc.id,
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        coverImage: data.coverImage || null,
        author: data.author,
        category: data.category,
        tags: data.tags || [],
        publishedAt: data.publishedAt,
        viewCount: (data.viewCount || 0) + 1,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        domain: data.domain || null,
    });
}
