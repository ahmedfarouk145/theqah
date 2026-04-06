// src/pages/blog/[slug].tsx
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import NavbarLanding from "@/components/NavbarLanding";
import { GetServerSideProps } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { URLS } from "@/config/constants";

interface BlogPostFull {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    coverImage: string | null;
    author: string;
    category: string;
    tags: string[];
    publishedAt: string | null;
    viewCount: number;
    seoTitle: string | null;
    seoDescription: string | null;
}

interface RelatedPost {
    slug: string;
    title: string;
    coverImage: string | null;
    category: string;
}

interface Props {
    post: BlogPostFull;
    related: RelatedPost[];
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, res }) => {
    const slug = params?.slug as string;
    if (!slug) return { notFound: true };

    const snap = await dbAdmin()
        .collection("blog_posts")
        .where("slug", "==", slug)
        .where("status", "==", "published")
        .limit(1)
        .get();

    if (snap.empty) return { notFound: true };

    const doc = snap.docs[0];
    const data = doc.data();

    // Increment view count (fire & forget)
    doc.ref.update({ viewCount: FieldValue.increment(1) }).catch(() => { });

    const post: BlogPostFull = {
        id: doc.id,
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        coverImage: data.coverImage || null,
        author: data.author,
        category: data.category,
        tags: data.tags || [],
        publishedAt: data.publishedAt?.toDate?.()?.toISOString?.() || null,
        viewCount: (data.viewCount || 0) + 1,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
    };

    // Fetch related posts (same category, different slug)
    const relatedSnap = await dbAdmin()
        .collection("blog_posts")
        .where("status", "==", "published")
        .where("category", "==", data.category)
        .orderBy("publishedAt", "desc")
        .limit(4)
        .get();

    const related: RelatedPost[] = relatedSnap.docs
        .filter((d) => d.data().slug !== slug)
        .slice(0, 3)
        .map((d) => {
            const rd = d.data();
            return {
                slug: rd.slug,
                title: rd.title,
                coverImage: rd.coverImage || null,
                category: rd.category,
            };
        });

    // Cache
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");

    return { props: { post, related } };
};

function formatDate(iso: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    } catch { return ""; }
}

function readingTime(html: string): number {
    const words = html.replace(/<[^>]*>/g, "").split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
}

export default function BlogPostPage({ post, related }: Props) {
    const pageTitle = post.seoTitle || post.title;
    const pageDesc = post.seoDescription || post.excerpt;
    const canonicalUrl = `${URLS.CANONICAL_ORIGIN}/blog/${post.slug}`;

    return (
        <>
            <Head>
                <title>{pageTitle} | مدونة مشتري موثّق</title>
                <meta name="description" content={pageDesc} />
                <link rel="canonical" href={canonicalUrl} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={canonicalUrl} />
                {post.coverImage && <meta property="og:image" content={post.coverImage} />}
                <meta property="article:author" content={post.author} />
                {post.publishedAt && <meta property="article:published_time" content={post.publishedAt} />}
                <meta property="article:section" content={post.category} />
                {post.tags.map((tag) => (
                    <meta key={tag} property="article:tag" content={tag} />
                ))}

                {/* Structured Data */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "Article",
                            headline: post.title,
                            description: post.excerpt,
                            image: post.coverImage || undefined,
                            author: { "@type": "Person", name: post.author },
                            datePublished: post.publishedAt,
                            publisher: {
                                "@type": "Organization",
                                name: "مشتري موثّق",
                                logo: { "@type": "ImageObject", url: `${URLS.CANONICAL_ORIGIN}/logo.png` },
                            },
                        }),
                    }}
                />
            </Head>

            <NavbarLanding />

            <main className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-950 dark:to-gray-900 pt-28 pb-16" dir="rtl">
                <article className="max-w-3xl mx-auto px-4 sm:px-6">

                    {/* Breadcrumb */}
                    <nav className="text-sm text-gray-500 dark:text-gray-400 mb-6 flex items-center gap-2">
                        <Link href="/" className="hover:text-green-700 transition">الرئيسية</Link>
                        <span>/</span>
                        <Link href="/blog" className="hover:text-green-700 transition">المدونة</Link>
                        <span>/</span>
                        <span className="text-gray-700 dark:text-gray-300">{post.title}</span>
                    </nav>

                    {/* Category & Meta */}
                    <div className="flex items-center gap-3 mb-4 text-sm">
                        <span className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-3 py-1 rounded-full font-medium">
                            {post.category}
                        </span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{formatDate(post.publishedAt)}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{readingTime(post.content)} دقائق قراءة</span>
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-6 leading-tight">
                        {post.title}
                    </h1>

                    {/* Author & Views */}
                    <div className="flex items-center justify-between mb-8 pb-6 border-b dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                                <span className="text-green-700 dark:text-green-400 font-bold text-sm">
                                    {post.author.charAt(0)}
                                </span>
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white text-sm">{post.author}</p>
                                <p className="text-xs text-gray-400">كاتب المقالة</p>
                            </div>
                        </div>
                        <span className="text-sm text-gray-400">{post.viewCount} مشاهدة</span>
                    </div>

                    {/* Cover Image */}
                    {post.coverImage && (
                        <div className="relative aspect-[16/9] rounded-2xl overflow-hidden mb-10 shadow-lg">
                            <Image
                                src={post.coverImage}
                                alt={post.title}
                                fill
                                className="object-cover"
                                priority
                            />
                        </div>
                    )}

                    {/* Content */}
                    <div
                        className="prose prose-lg prose-green dark:prose-invert max-w-none
              prose-headings:text-green-800 dark:prose-headings:text-green-400
              prose-a:text-green-700 prose-a:no-underline hover:prose-a:underline
              prose-img:rounded-xl prose-img:shadow-md
              leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: post.content }}
                    />

                    {/* Tags */}
                    {post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t dark:border-gray-700">
                            {post.tags.map((tag) => (
                                <Link
                                    key={tag}
                                    href={`/blog?tag=${encodeURIComponent(tag)}`}
                                    className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full text-sm hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 transition"
                                >
                                    #{tag}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Share */}
                    <div className="flex items-center gap-4 mt-8 pt-6 border-t dark:border-gray-700">
                        <span className="text-sm font-medium text-gray-500">مشاركة:</span>
                        <button
                            onClick={() => {
                                if (typeof window !== "undefined") {
                                    navigator.clipboard.writeText(window.location.href);
                                    alert("تم نسخ الرابط!");
                                }
                            }}
                            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                        >
                            📋 نسخ الرابط
                        </button>
                        <a
                            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${typeof window !== "undefined" ? encodeURIComponent(window.location.href) : ""}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                        >
                            𝕏 تويتر
                        </a>
                    </div>
                </article>

                {/* Related Posts */}
                {related.length > 0 && (
                    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-16">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">مقالات ذات صلة</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {related.map((r) => (
                                <Link key={r.slug} href={`/blog/${r.slug}`} className="group">
                                    <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 dark:border-gray-700 group-hover:-translate-y-1">
                                        <div className="aspect-[16/9] bg-green-50 dark:bg-green-900/20 relative">
                                            {r.coverImage ? (
                                                <Image src={r.coverImage} alt={r.title} fill className="object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full">
                                                    <span className="text-4xl opacity-30">📄</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors text-sm">
                                                {r.title}
                                            </h3>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </main>

            <footer className="bg-white dark:bg-gray-900 border-t dark:border-gray-800 py-6 text-center text-sm text-gray-500" dir="rtl">
                <a href="https://drive.google.com/file/d/1HTVS6PJeV5p9jOHFWq_8Kc_VC-gpQZVg/view?usp=drivesdk" target="_blank" rel="noopener noreferrer" className="hover:text-green-700 transition-colors">النظام مسجّل ومحمي قانونيًا لدى الهيئة السعودية للملكية الفكرية</a>
                <p className="mt-1">© {new Date().getFullYear()} مشتري موثّق. جميع الحقوق محفوظة.</p>
            </footer>
        </>
    );
}
