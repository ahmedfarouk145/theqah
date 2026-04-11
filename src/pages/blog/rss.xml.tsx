// src/pages/blog/rss.xml.tsx
// RSS 2.0 feed for the blog.
//
// Why an RSS feed still matters in 2026:
//  - Feed readers (NetNewsWire, Feedly, Reeder, etc.) still drive real traffic.
//  - AI ingestion pipelines (ChatGPT Search, Perplexity, Claude's web tooling)
//    treat RSS as a reliable, low-noise signal for fresh content. A well-formed
//    feed is faster and more accurate for them than scraping HTML cards.
//  - Linked from every blog page via <link rel="alternate" type="application/rss+xml">,
//    so crawlers that honor feed auto-discovery will find it automatically.
//
// Security note: every string that comes from Firestore (title, excerpt,
// author, plain content) runs through escapeXml() before emission. RSS parsers
// are stricter than HTML parsers — an unescaped '&' or '<' in a title breaks
// the entire feed, not just one entry — so there is zero tolerance for raw
// user text here.
import { GetServerSideProps } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const FEED_URL = `${SITE_URL}/blog/rss.xml`;
const BLOG_URL = `${SITE_URL}/blog`;

function escapeXml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Strip HTML tags and normalize whitespace for the feed's <description>.
 * Not a sanitizer — its output is XML-escaped before emission, so we only
 * need readable plain text.
 */
function htmlToPlainText(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function toRfc822(date: Date): string {
    // RSS 2.0 requires RFC-822 dates, e.g. "Tue, 10 Apr 2026 12:34:56 +0000".
    return date.toUTCString();
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    let items: {
        slug: string;
        title: string;
        excerpt: string;
        content: string;
        author: string;
        category: string;
        publishedAt: Date | null;
    }[] = [];

    try {
        const snap = await dbAdmin()
            .collection("blog_posts")
            .where("status", "==", "published")
            .orderBy("publishedAt", "desc")
            .limit(50)
            .get();

        items = snap.docs.map((doc) => {
            const data = doc.data();
            return {
                slug: String(data.slug || doc.id),
                title: String(data.title || ""),
                excerpt: String(data.excerpt || ""),
                content: String(data.content || ""),
                author: String(data.author || "مشتري موثّق"),
                category: String(data.category || ""),
                publishedAt: data.publishedAt?.toDate?.() || null,
            };
        });
    } catch (err) {
        console.error("[rss] Failed to fetch blog posts:", err);
    }

    const lastBuildDate = toRfc822(
        items[0]?.publishedAt ? items[0].publishedAt : new Date()
    );

    const itemsXml = items
        .map((p) => {
            const link = `${SITE_URL}/blog/${p.slug}`;
            const pubDate = p.publishedAt ? toRfc822(p.publishedAt) : lastBuildDate;
            const description = p.excerpt
                ? p.excerpt
                : htmlToPlainText(p.content).slice(0, 500);

            return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>noreply@theqah.com.sa (${escapeXml(p.author)})</author>
      <category>${escapeXml(p.category)}</category>
      <description>${escapeXml(description)}</description>
    </item>`;
        })
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>مدونة مشتري موثّق</title>
    <link>${escapeXml(BLOG_URL)}</link>
    <atom:link href="${escapeXml(FEED_URL)}" rel="self" type="application/rss+xml" />
    <description>مقالات ونصائح حول التجارة الإلكترونية، تقييمات المتاجر، وبناء الثقة مع العملاء من فريق مشتري موثّق.</description>
    <language>ar</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>theqah.com.sa</generator>
${itemsXml}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=600"
    );
    res.write(xml);
    res.end();

    return { props: {} };
};

// The component won't actually render since we write directly to the response.
export default function BlogRssPage() {
    return null;
}
