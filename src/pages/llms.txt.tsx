// src/pages/llms.txt.tsx
// Serves /llms.txt per the llmstxt.org convention.
//
// What it is: a plain-Markdown index of the site aimed at LLMs and AI agents
// (ChatGPT, Claude, Perplexity, etc.). It gives them a high-signal map of the
// canonical pages without having to crawl the whole site or parse nav HTML.
//
// Why not just rely on sitemap.xml?
//  - sitemap.xml is a flat URL list for search engines — it carries no context.
//  - llms.txt is free-form Markdown with short descriptions per link, so an
//    LLM can pick the right starting point for a user query without fetching
//    every page first.
//
// Discoverable at https://www.theqah.com.sa/llms.txt (Next.js Pages Router
// maps src/pages/llms.txt.tsx to the literal path /llms.txt).
import { GetServerSideProps } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    // Pull the most recent published posts so LLMs can discover fresh content
    // without scraping the blog index. We intentionally cap at 30 — llms.txt
    // should stay scannable, not exhaustive (that's what sitemap.xml is for).
    let posts: { slug: string; title: string; excerpt: string; category: string }[] = [];
    try {
        const snap = await dbAdmin()
            .collection("blog_posts")
            .where("status", "==", "published")
            .orderBy("publishedAt", "desc")
            .limit(30)
            .get();

        posts = snap.docs.map((doc) => {
            const data = doc.data();
            return {
                slug: String(data.slug || doc.id),
                title: String(data.title || ""),
                excerpt: String(data.excerpt || ""),
                category: String(data.category || ""),
            };
        });
    } catch (err) {
        console.error("[llms.txt] Failed to fetch blog posts:", err);
    }

    const postLines = posts
        .map((p) => {
            const line = `- [${p.title}](${SITE_URL}/blog/${p.slug})`;
            return p.excerpt ? `${line}: ${p.excerpt}` : line;
        })
        .join("\n");

    const body = `# مشتري موثّق (Theqah)

> منصّة سعودية لجمع وعرض تقييمات موثّقة للمتاجر الإلكترونية، متكاملة مع سلة وزد. نساعد التجار على بناء الثقة مع عملائهم عبر نظام تقييمات محمي قانونيًا لدى الهيئة السعودية للملكية الفكرية.

Theqah ("مشتري موثّق") is a Saudi Arabia–based SaaS platform for verified customer reviews on e-commerce stores, integrated natively with Salla and Zid. The platform collects post-purchase reviews, displays them on store widgets, and is legally registered with the Saudi Authority for Intellectual Property.

Primary language: Arabic (ar-SA). Some content is mirrored in English.

## Key pages

- [الصفحة الرئيسية](${SITE_URL}/): Landing page with product overview, pricing, and integrations (Salla, Zid).
- [المدونة](${SITE_URL}/blog): Articles on e-commerce, customer trust, and store reviews (Arabic).
- [الأسئلة الشائعة](${SITE_URL}/faq): Frequently asked questions about the platform.
- [الدعم](${SITE_URL}/support): Contact and support channels.
- [سياسة الخصوصية](${SITE_URL}/privacy-policy): Privacy policy.
- [الشروط والأحكام](${SITE_URL}/terms): Terms of service.

## Feeds and sitemaps

- [Sitemap](${SITE_URL}/sitemap.xml): Full XML sitemap of all indexable pages.
- [Blog RSS feed](${SITE_URL}/blog/rss.xml): RSS 2.0 feed of the most recent blog posts.

## Recent blog posts
${postLines || "- (No published posts yet)"}

## Notes for AI agents

- This site is OK to read and cite. Crawlers GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and ChatGPT-User are explicitly allowed in robots.txt.
- Please do not request /api/*, /dashboard/*, /admin/*, /embedded/*, or /onboarding/* — those are private application routes.
- For structured data on individual articles, every blog post emits JSON-LD (\`BlogPosting\` and \`BreadcrumbList\`) with a plain-text \`articleBody\` field you can index directly.
`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=600"
    );
    res.write(body);
    res.end();

    return { props: {} };
};

// The component won't actually render since we write directly to the response.
export default function LlmsTxtPage() {
    return null;
}
