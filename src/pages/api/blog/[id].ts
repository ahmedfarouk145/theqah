// src/pages/api/blog/[id].ts
// Blog owner CRUD: GET (single), PUT (update), DELETE
import type { NextApiRequest, NextApiResponse } from "next";
import { requireBlogOwner } from "@/backend/server/auth/requireBlogOwner";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeDomain } from "@/backend/server/types/blog.types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        await requireBlogOwner(req);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "unauthorized";
        const code = msg.includes("forbidden") ? 403 : 401;
        return res.status(code).json({ error: msg });
    }

    const { id } = req.query;
    if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "missing id" });
    }

    const docRef = dbAdmin().collection("blog_posts").doc(id);

    if (req.method === "GET") {
        const snap = await docRef.get();
        if (!snap.exists) return res.status(404).json({ error: "not found" });
        return res.json({ id: snap.id, ...snap.data() });
    }

    if (req.method === "PUT") {
        const snap = await docRef.get();
        if (!snap.exists) return res.status(404).json({ error: "not found" });

        const { title, excerpt, content, coverImage, author, category, tags, status, seoTitle, seoDescription, domain } = req.body;
        const existing = snap.data()!;
        const now = Timestamp.now();

        const updates: Record<string, unknown> = { updatedAt: now };

        if (title !== undefined) updates.title = title;
        if (excerpt !== undefined) updates.excerpt = excerpt;
        if (content !== undefined) updates.content = content;
        if (coverImage !== undefined) updates.coverImage = coverImage;
        if (author !== undefined) updates.author = author;
        if (category !== undefined) updates.category = category;
        if (tags !== undefined) updates.tags = tags;
        if (seoTitle !== undefined) updates.seoTitle = seoTitle;
        if (seoDescription !== undefined) updates.seoDescription = seoDescription;
        if (domain !== undefined) {
            if (typeof domain === "string" && domain.trim() && !normalizeDomain(domain)) {
                return res.status(400).json({ error: "invalid domain" });
            }
            updates.domain = normalizeDomain(domain);
        }

        if (status !== undefined) {
            updates.status = status;
            // Set publishedAt when first publishing
            if (status === "published" && existing.status !== "published") {
                updates.publishedAt = now;
            }
        }

        await docRef.update(updates);
        const updated = await docRef.get();
        return res.json({ id: updated.id, ...updated.data() });
    }

    if (req.method === "DELETE") {
        const snap = await docRef.get();
        if (!snap.exists) return res.status(404).json({ error: "not found" });
        await docRef.delete();
        return res.json({ deleted: true });
    }

    return res.status(405).json({ error: "method not allowed" });
}
