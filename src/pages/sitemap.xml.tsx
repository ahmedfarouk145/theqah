// src/pages/sitemap.xml.tsx
import { GetServerSideProps } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

// Static pages with their priorities and change frequencies
const STATIC_PAGES: { path: string; priority: number; changefreq: string }[] = [
    { path: "/", priority: 1.0, changefreq: "weekly" },
    { path: "/blog", priority: 0.9, changefreq: "daily" },
    { path: "/faq", priority: 0.7, changefreq: "monthly" },
    { path: "/privacy-policy", priority: 0.3, changefreq: "yearly" },
    { path: "/terms", priority: 0.3, changefreq: "yearly" },
    { path: "/support", priority: 0.6, changefreq: "monthly" },
];

function escapeXml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function toW3CDate(date: Date): string {
    return date.toISOString().split("T")[0];
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    // Fetch published blog posts for dynamic URLs
    let blogEntries: { slug: string; publishedAt: string | null }[] = [];
    try {
        const snap = await dbAdmin()
            .collection("blog_posts")
            .where("status", "==", "published")
            .orderBy("publishedAt", "desc")
            .limit(500)
            .get();

        blogEntries = snap.docs.map((doc) => {
            const data = doc.data();
            const publishedAt = data.publishedAt?.toDate?.()?.toISOString?.() || null;
            return { slug: data.slug, publishedAt };
        });
    } catch (err) {
        console.error("[sitemap] Failed to fetch blog posts:", err);
    }

    const today = toW3CDate(new Date());

    // Build XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${STATIC_PAGES.map(
        (page) => `  <url>
    <loc>${escapeXml(`${SITE_URL}${page.path}`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`
    ).join("\n")}
${blogEntries
            .map(
                (post) => `  <url>
    <loc>${escapeXml(`${SITE_URL}/blog/${post.slug}`)}</loc>
    <lastmod>${post.publishedAt ? toW3CDate(new Date(post.publishedAt)) : today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
            )
            .join("\n")}
</urlset>`;

    // Set response headers
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=600"
    );
    res.write(xml);
    res.end();

    return { props: {} };
};

// The component won't actually render since we write directly to the response
export default function SitemapPage() {
    return null;
}
