// src/pages/robots.txt.tsx
import { GetServerSideProps } from "next";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    // Private application paths that no crawler (human search engine or AI)
    // should ever index. Kept as a single string so every User-agent block
    // below stays in sync — robots.txt does NOT inherit Disallow lines across
    // User-agent groups, so each named bot has to repeat them explicitly.
    const disallows = [
        "Disallow: /api/",
        "Disallow: /dashboard",
        "Disallow: /dashboard/",
        "Disallow: /admin/",
        "Disallow: /embedded/",
        "Disallow: /onboarding/",
        "Disallow: /salla/",
        "Disallow: /connect/",
        "Disallow: /setup-password",
        "Disallow: /reset-password",
        "Disallow: /forgot-password",
        "Disallow: /report",
    ].join("\n");

    // AI crawlers we explicitly welcome. Listing them by name (even though
    // they'd otherwise fall back to `User-agent: *`) is a positive signal:
    // some operators check for their own UA before crawling, and it makes
    // our intent auditable.
    const aiCrawlers = [
        "GPTBot", // OpenAI training crawler
        "ChatGPT-User", // OpenAI user-triggered fetches (ChatGPT browsing)
        "OAI-SearchBot", // OpenAI ChatGPT Search index
        "ClaudeBot", // Anthropic training crawler
        "Claude-Web", // Anthropic user-triggered fetches
        "anthropic-ai", // Legacy Anthropic agent name
        "PerplexityBot", // Perplexity search/answer engine
        "Perplexity-User", // Perplexity user-triggered fetches
        "Google-Extended", // Google Gemini/Bard training opt-in signal
        "Applebot-Extended", // Apple Intelligence training opt-in signal
        "Meta-ExternalAgent", // Meta AI crawler
        "Meta-ExternalFetcher",
        "Bytespider", // ByteDance / TikTok AI crawler
        "Amazonbot", // Amazon Alexa / AI
        "cohere-ai", // Cohere
        "DuckAssistBot", // DuckDuckGo AI assist
        "YouBot", // You.com search
        "CCBot", // Common Crawl (feeds many model training sets)
        "Diffbot", // Diffbot structured crawl
        "ImagesiftBot", // The Hive / Imagesift
        "Timpibot", // Timpi search
        "Kagibot", // Kagi search
    ];

    const aiCrawlerBlocks = aiCrawlers
        .map((ua) => `User-agent: ${ua}\nAllow: /\n${disallows}`)
        .join("\n\n");

    const robotsTxt = `# robots.txt for ${SITE_URL}
# Private application paths are disallowed for every crawler. AI crawlers
# that respect this file are explicitly welcomed below.

User-agent: *
Allow: /
${disallows}

# --- AI crawlers: explicitly allowed (public content only) ---

${aiCrawlerBlocks}

# --- Feeds and discovery ---
Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}/blog/rss.xml
`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=86400, stale-while-revalidate=3600"
    );
    res.write(robotsTxt);
    res.end();

    return { props: {} };
};

// The component won't actually render since we write directly to the response
export default function RobotsPage() {
    return null;
}
