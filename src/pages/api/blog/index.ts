// src/pages/api/blog/index.ts
// Blog owner CRUD: GET (list all), POST (create)
import type { NextApiRequest, NextApiResponse } from "next";
import { requireBlogOwner } from "@/backend/server/auth/requireBlogOwner";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeDomain } from "@/backend/server/types/blog.types";

function slugify(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[\s]+/g, "-")
        .replace(/[^\u0621-\u064Aa-z0-9\-]/g, "") // keep Arabic + Latin + numbers + dash
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        || `post-${Date.now()}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        await requireBlogOwner(req);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "unauthorized";
        const code = msg.includes("forbidden") ? 403 : 401;
        return res.status(code).json({ error: msg });
    }

    const col = dbAdmin().collection("blog_posts");

    if (req.method === "GET") {
        const snap = await col.orderBy("createdAt", "desc").limit(100).get();
        const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return res.json({ posts });
    }

    if (req.method === "POST") {
        const { title, excerpt, content, coverImage, author, category, tags, status, seoTitle, seoDescription, domain } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: "title and content are required" });
        }

        // Reject non-empty domains that fail to parse so the owner notices a
        // typo immediately rather than silently saving an invalid host.
        if (typeof domain === "string" && domain.trim() && !normalizeDomain(domain)) {
            return res.status(400).json({ error: "invalid domain" });
        }

        const slug = slugify(title);

        // Check slug uniqueness
        const existing = await col.where("slug", "==", slug).limit(1).get();
        const finalSlug = existing.empty ? slug : `${slug}-${Date.now()}`;

        const now = Timestamp.now();
        const postData = {
            slug: finalSlug,
            title,
            excerpt: excerpt || "",
            content,
            coverImage: coverImage || null,
            author: author || "فريق ثقة",
            category: category || "أخبار المنصة",
            tags: tags || [],
            status: status || "draft",
            publishedAt: status === "published" ? now : null,
            createdAt: now,
            updatedAt: now,
            seoTitle: seoTitle || null,
            seoDescription: seoDescription || null,
            domain: normalizeDomain(domain),
            viewCount: 0,
        };

        const docRef = await col.add(postData);
        return res.status(201).json({ id: docRef.id, ...postData });
    }

    return res.status(405).json({ error: "method not allowed" });
}
