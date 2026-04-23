// src/pages/blog/index.tsx
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import NavbarLanding from "@/components/NavbarLanding";
import JsonLd from "@/components/JsonLd";
import { GetServerSideProps } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { URLS } from "@/config/constants";

interface BlogPostSummary {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    coverImage: string | null;
    author: string;
    category: string;
    tags: string[];
    publishedAt: string | null;
    viewCount: number;
}

interface Props {
    posts: BlogPostSummary[];
    categories: string[];
    activeCategory: string;
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => {
    const category = (query.category as string) || "";
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const pageSize = 9;

    let q = dbAdmin()
        .collection("blog_posts")
        .where("status", "==", "published")
        .orderBy("publishedAt", "desc");

    if (category) {
        q = q.where("category", "==", category);
    }

    const snap = await q.limit(100).get();

    const allPosts: BlogPostSummary[] = snap.docs.map((d) => {
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
            publishedAt: data.publishedAt?.toDate?.()?.toISOString?.() || null,
            viewCount: data.viewCount || 0,
        };
    });

    const total = allPosts.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const posts = allPosts.slice(start, start + pageSize);

    // Collect unique categories
    const catSet = new Set<string>();
    snap.docs.forEach((d) => { const c = d.data().category; if (c) catSet.add(c); });
    const categories = Array.from(catSet);

    return {
        props: {
            posts,
            categories,
            activeCategory: category,
            pagination: { page, pageSize, total, totalPages },
        },
    };
};

function formatDate(iso: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    } catch { return ""; }
}




export default function BlogPage({ posts, categories, activeCategory, pagination }: Props) {
    const pageTitle = activeCategory
        ? `${activeCategory} | مدونة مشتري موثق`
        : "المدونة | مشتري موثق";
    const pageDesc =
        "مقالات ونصائح حول التجارة الإلكترونية، تقييمات المتاجر، وبناء الثقة مع العملاء من فريق مشتري موثق.";
    const canonicalUrl = activeCategory
        ? `${URLS.CANONICAL_ORIGIN}/blog?category=${encodeURIComponent(activeCategory)}`
        : `${URLS.CANONICAL_ORIGIN}/blog`;
    const ogImage = `${URLS.CANONICAL_ORIGIN}/logo.png`;

    // Blog (CollectionPage) JSON-LD — gives AI crawlers a list of recent posts
    // with enough metadata to understand the feed without parsing HTML cards.
    const blogJsonLd = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": `${URLS.CANONICAL_ORIGIN}/blog`,
        url: `${URLS.CANONICAL_ORIGIN}/blog`,
        name: "مدونة مشتري موثق",
        description: pageDesc,
        inLanguage: "ar",
        publisher: {
            "@type": "Organization",
            name: "مشتري موثق",
            url: URLS.CANONICAL_ORIGIN,
            logo: {
                "@type": "ImageObject",
                url: `${URLS.CANONICAL_ORIGIN}/logo.png`,
            },
        },
        blogPost: posts.map((p) => ({
            "@type": "BlogPosting",
            "@id": `${URLS.CANONICAL_ORIGIN}/blog/${p.slug}`,
            url: `${URLS.CANONICAL_ORIGIN}/blog/${p.slug}`,
            headline: p.title,
            description: p.excerpt,
            image: p.coverImage || ogImage,
            datePublished: p.publishedAt || undefined,
            articleSection: p.category,
            keywords: p.tags.join(", "),
            author: { "@type": "Person", name: p.author },
        })),
    };

    // WebSite JSON-LD with SearchAction — lets ChatGPT Search / Google SGE
    // expose the blog's category filter as a sitelinks searchbox equivalent.
    const websiteJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${URLS.CANONICAL_ORIGIN}/#website`,
        url: URLS.CANONICAL_ORIGIN,
        name: "مشتري موثق",
        inLanguage: "ar",
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${URLS.CANONICAL_ORIGIN}/blog?category={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
        },
    };

    return (
        <>
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <link rel="canonical" href={canonicalUrl} />

                {/* OpenGraph */}
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={canonicalUrl} />
                <meta property="og:site_name" content="مشتري موثق" />
                <meta property="og:locale" content="ar_SA" />
                <meta property="og:image" content={ogImage} />

                {/* Twitter / X Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={pageTitle} />
                <meta name="twitter:description" content={pageDesc} />
                <meta name="twitter:image" content={ogImage} />

                {/* Feed discovery for AI crawlers & feed readers */}
                <link
                    rel="alternate"
                    type="application/rss+xml"
                    title="مدونة مشتري موثق"
                    href={`${URLS.CANONICAL_ORIGIN}/blog/rss.xml`}
                />

                {/* Structured Data — Blog feed & WebSite search action.
                    JsonLd pre-escapes <, >, &, U+2028/9 so `</script>` inside
                    any post can't break out of the script tag. */}
                <JsonLd data={blogJsonLd} />
                <JsonLd data={websiteJsonLd} />
            </Head>

            <NavbarLanding
                loginHref="/blog/login"
                loginLabel="دخول المدونة"
                loginLabelMobile="دخول المدونة"
                loginButtonClassName="bg-emerald-900 dark:bg-emerald-800 hover:bg-emerald-950 dark:hover:bg-emerald-900"
            />

            <main id="main-content" className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-950 dark:to-gray-900 pt-28 pb-16" dir="rtl">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">

                    {/* Header */}
                    <div className="text-center mb-12">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-green-800 dark:text-green-400 mb-4">
                            المدونة
                        </h1>
                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            مقالات ونصائح لمساعدتك في بناء ثقة عملائك وتطوير تجارتك الإلكترونية
                        </p>
                    </div>

                    {/* Category Filter */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-center mb-10">
                            <Link
                                href="/blog"
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${!activeCategory
                                    ? "bg-green-700 text-white shadow-md"
                                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-green-50 dark:hover:bg-gray-700"}`}
                            >
                                الكل
                            </Link>
                            {categories.map((cat) => (
                                <Link
                                    key={cat}
                                    href={`/blog?category=${encodeURIComponent(cat)}`}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === cat
                                        ? "bg-green-700 text-white shadow-md"
                                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-green-50 dark:hover:bg-gray-700"}`}
                                >
                                    {cat}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Posts Grid */}
                    {posts.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="text-6xl mb-4">📝</div>
                            <p className="text-xl text-gray-500 dark:text-gray-400">لا توجد مقالات حالياً</p>
                            <p className="text-gray-400 dark:text-gray-500 mt-2">ترقبوا مقالاتنا القادمة!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {posts.map((post) => (
                                <Link key={post.id} href={`/blog/${post.slug}`} className="group">
                                    <article className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 group-hover:-translate-y-1">
                                        {/* Cover Image */}
                                        <div className="aspect-[16/9] bg-gradient-to-br from-green-100 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/20 relative overflow-hidden">
                                            {post.coverImage ? (
                                                <Image
                                                    src={post.coverImage}
                                                    alt={post.title}
                                                    fill
                                                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center h-full">
                                                    <span className="text-5xl opacity-40">📄</span>
                                                </div>
                                            )}
                                            <span className="absolute top-3 right-3 bg-green-700/90 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                                                {post.category}
                                            </span>
                                        </div>

                                        {/* Content */}
                                        <div className="p-5">
                                            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors">
                                                {post.title}
                                            </h2>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4 leading-relaxed">
                                                {post.excerpt}
                                            </p>
                                            <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                                                <div className="flex items-center gap-2">
                                                    <span>{post.author}</span>
                                                    <span>·</span>
                                                    <span>{formatDate(post.publishedAt)}</span>
                                                </div>
                                                <span>{post.viewCount} مشاهدة</span>
                                            </div>
                                        </div>
                                    </article>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="flex justify-center gap-2 mt-12">
                            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                                <Link
                                    key={p}
                                    href={`/blog?page=${p}${activeCategory ? `&category=${encodeURIComponent(activeCategory)}` : ""}`}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-medium transition-all ${p === pagination.page
                                        ? "bg-green-700 text-white shadow-md"
                                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-green-50"}`}
                                >
                                    {p}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white dark:bg-gray-900 border-t dark:border-gray-800 py-6 pb-20 text-center text-sm text-gray-500" dir="rtl">
                <a href="https://drive.google.com/file/d/1HTVS6PJeV5p9jOHFWq_8Kc_VC-gpQZVg/view?usp=drivesdk" target="_blank" rel="noopener noreferrer" className="hover:text-green-700 transition-colors">النظام مسجّل ومحمي قانونيًا لدى الهيئة السعودية للملكية الفكرية</a>
                <p className="mt-1">© {new Date().getFullYear()} مشتري موثق. جميع الحقوق محفوظة.</p>
            </footer>
        </>
    );
}
