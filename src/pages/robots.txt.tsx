// src/pages/robots.txt.tsx
import { GetServerSideProps } from "next";

const SITE_URL = "https://theqah.com.sa";

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    const robotsTxt = `# robots.txt for ${SITE_URL}
User-agent: *
Allow: /

# AI Crawlers - explicitly allowed
User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

# Disallow private/internal paths
Disallow: /api/
Disallow: /dashboard
Disallow: /dashboard/
Disallow: /admin/
Disallow: /embedded/
Disallow: /onboarding/
Disallow: /salla/
Disallow: /connect/
Disallow: /setup-password
Disallow: /reset-password
Disallow: /forgot-password
Disallow: /report

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml
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
