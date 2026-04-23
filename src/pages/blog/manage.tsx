// src/pages/blog/manage.tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useBlogAuth } from '@/contexts/BlogAuthContext';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import axios from '@/lib/axiosInstance';
import { Loader2, Plus, Pencil, Trash2, Eye, EyeOff, ArrowRight, Save, X, Upload } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// Cover uploads must use `blogStorage` (bound to the `blog` Firebase app)
// not the default `storage`. The blog editor authenticates via `blogAuth`,
// so only `blogStorage` carries the right token for Storage Rules.
import { blogStorage } from '@/lib/firebase';

const TipTapEditor = dynamic(() => import('@/components/blog/TipTapEditor'), { ssr: false });

const BLOG_OWNER_EMAIL = 'abuyzzn@yahoo.com';

const CATEGORIES = [
    'نصائح للتجار',
    'أخبار المنصة',
    'دليل الاستخدام',
    'التجارة الإلكترونية',
    'تقييمات وثقة',
    'قصص نجاح',
];

interface BlogPost {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    coverImage?: string | null;
    author: string;
    category: string;
    tags: string[];
    status: 'draft' | 'published';
    publishedAt?: unknown;
    createdAt?: unknown;
    domain?: string | null;
    viewCount: number;
}

type View = 'list' | 'edit';

export default function BlogManage() {
    const { user, loading: authLoading } = useBlogAuth();
    const [view, setView] = useState<View>('list');
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingPost, setEditingPost] = useState<BlogPost | null>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [tagsStr, setTagsStr] = useState('');
    const [author, setAuthor] = useState('فريق ثقة');
    const [coverImage, setCoverImage] = useState('');
    const [uploadingCover, setUploadingCover] = useState(false);
    const [seoTitle, setSeoTitle] = useState('');
    const [seoDescription, setSeoDescription] = useState('');
    const [domain, setDomain] = useState('');
    const coverInputRef = useRef<HTMLInputElement>(null);

    const handleCoverUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('يرجى اختيار ملف صورة');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
            return;
        }
        setUploadingCover(true);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const storageRef = ref(blogStorage, `blog/covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);
            setCoverImage(url);
        } catch (err) {
            console.error('Cover upload error:', err);
            // Surface the real Firebase Storage error so failures are
            // diagnosable without opening devtools.
            const code = (err as { code?: string })?.code || '';
            const message = (err as { message?: string })?.message || String(err);
            alert(`خطأ في رفع الصورة${code ? ` (${code})` : ''}: ${message}`);
        } finally {
            setUploadingCover(false);
        }
    };

    const isOwner = user?.email?.toLowerCase() === BLOG_OWNER_EMAIL.toLowerCase();

    const getToken = useCallback(async () => {
        if (!user) return '';
        return user.getIdToken(true);
    }, [user]);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const res = await axios.get('/api/blog', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setPosts(res.data.posts || []);
        } catch {
            setPosts([]);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        if (isOwner) fetchPosts();
    }, [isOwner, fetchPosts]);

    const resetForm = () => {
        setTitle('');
        setExcerpt('');
        setContent('');
        setCategory(CATEGORIES[0]);
        setTagsStr('');
        setAuthor('فريق ثقة');
        setCoverImage('');
        setSeoTitle('');
        setSeoDescription('');
        setDomain('');
        setEditingPost(null);
    };

    const startNew = () => {
        resetForm();
        setView('edit');
    };

    const startEdit = (post: BlogPost) => {
        setTitle(post.title);
        setExcerpt(post.excerpt);
        setContent(post.content);
        setCategory(post.category);
        setTagsStr((post.tags || []).join('، '));
        setAuthor(post.author);
        setCoverImage(post.coverImage || '');
        setSeoTitle('');
        setSeoDescription('');
        setDomain(post.domain || '');
        setEditingPost(post);
        setView('edit');
    };

    const savePost = async (status: 'draft' | 'published') => {
        if (!title.trim() || !content.trim()) {
            alert('العنوان والمحتوى مطلوبان');
            return;
        }
        setSaving(true);
        try {
            const token = await getToken();
            const tags = tagsStr.split(/[,،]/).map((t) => t.trim()).filter(Boolean);
            const payload = { title, excerpt, content, category, tags, author, coverImage: coverImage || null, status, seoTitle, seoDescription, domain: domain.trim() || null };

            if (editingPost) {
                await axios.put(`/api/blog/${editingPost.id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            } else {
                await axios.post('/api/blog', payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            }

            await fetchPosts();
            setView('list');
            resetForm();
        } catch (err) {
            alert('خطأ في الحفظ');
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const deletePost = async (id: string) => {
        if (!confirm('هل أنت متأكد من حذف هذه المقالة؟')) return;
        try {
            const token = await getToken();
            await axios.delete(`/api/blog/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchPosts();
        } catch { alert('خطأ في الحذف'); }
    };

    const togglePublish = async (post: BlogPost) => {
        const newStatus = post.status === 'published' ? 'draft' : 'published';
        try {
            const token = await getToken();
            await axios.put(`/api/blog/${post.id}`, { status: newStatus }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchPosts();
        } catch { alert('خطأ في تغيير الحالة'); }
    };

    // Auth Loading
    if (authLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
        );
    }

    // Not logged in or not owner
    if (!user || !isOwner) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
                <div className="max-w-md w-full bg-white border rounded-2xl p-8 shadow-lg text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <EyeOff className="h-8 w-8 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">غير مصرح</h2>
                    <p className="text-gray-600 mb-6">هذه الصفحة متاحة فقط لصاحب المدونة.</p>
                    <Link href="/blog/login" className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
                        تسجيل الدخول
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>إدارة المدونة | مشتري موثق</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>

            <div className="min-h-screen bg-gray-50" dir="rtl">
                {/* Header */}
                <header className="bg-white border-b shadow-sm sticky top-0 z-30">
                    <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link href="/blog" className="text-gray-400 hover:text-green-700 transition">
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                            <h1 className="text-xl font-bold text-green-800">إدارة المدونة</h1>
                        </div>
                        {view === 'list' && (
                            <button
                                onClick={startNew}
                                className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition font-medium text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                مقالة جديدة
                            </button>
                        )}
                    </div>
                </header>

                <div className="max-w-6xl mx-auto px-4 py-8">

                    {/* LIST VIEW */}
                    {view === 'list' && (
                        <>
                            {loading ? (
                                <div className="flex justify-center py-20">
                                    <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                                </div>
                            ) : posts.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="text-6xl mb-4">📝</div>
                                    <p className="text-xl text-gray-500 mb-4">لا توجد مقالات بعد</p>
                                    <button
                                        onClick={startNew}
                                        className="px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 transition font-medium"
                                    >
                                        أنشئ أول مقالة
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {posts.map((post) => (
                                        <div key={post.id} className="bg-white rounded-xl border p-4 flex items-center justify-between hover:shadow-md transition">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-bold text-gray-900 truncate">{post.title}</h3>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${post.status === 'published'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {post.status === 'published' ? 'منشور' : 'مسودة'}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-500 truncate">{post.excerpt || 'بدون ملخص'}</p>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                                    <span>{post.category}</span>
                                                    <span>·</span>
                                                    <span>{post.viewCount || 0} مشاهدة</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mr-4">
                                                <button
                                                    onClick={() => togglePublish(post)}
                                                    className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-green-700"
                                                    title={post.status === 'published' ? 'إلغاء النشر' : 'نشر'}
                                                >
                                                    {post.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => startEdit(post)}
                                                    className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-blue-600"
                                                    title="تعديل"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => deletePost(post.id)}
                                                    className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-red-600"
                                                    title="حذف"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                {post.status === 'published' && (
                                                    <Link
                                                        href={`/blog/${post.slug}`}
                                                        target="_blank"
                                                        className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-green-600"
                                                        title="عرض"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* EDIT VIEW */}
                    {view === 'edit' && (
                        <div className="space-y-6">
                            {/* Back */}
                            <button
                                onClick={() => { setView('list'); resetForm(); }}
                                className="flex items-center gap-2 text-gray-500 hover:text-green-700 transition text-sm"
                            >
                                <ArrowRight className="w-4 h-4" />
                                العودة للقائمة
                            </button>

                            <h2 className="text-2xl font-bold text-gray-900">
                                {editingPost ? 'تعديل المقالة' : 'مقالة جديدة'}
                            </h2>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                                    placeholder="عنوان المقالة..."
                                />
                            </div>

                            {/* Excerpt */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">الملخص</label>
                                <textarea
                                    value={excerpt}
                                    onChange={(e) => setExcerpt(e.target.value)}
                                    rows={2}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="ملخص قصير يظهر في قائمة المقالات..."
                                />
                            </div>

                            {/* Content - TipTap Editor */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">المحتوى *</label>
                                <TipTapEditor content={content} onChange={setContent} />
                            </div>

                            {/* Category + Tags row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="blog-category" className="block text-sm font-medium text-gray-700 mb-1">التصنيف</label>
                                    <select
                                        id="blog-category"
                                        title="اختيار التصنيف"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500"
                                    >
                                        {CATEGORIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">الوسوم (مفصولة بفاصلة)</label>
                                    <input
                                        type="text"
                                        value={tagsStr}
                                        onChange={(e) => setTagsStr(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500"
                                        placeholder="متاجر، تقييمات، ثقة"
                                    />
                                </div>
                            </div>

                            {/* Author + Cover Image */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="blog-author" className="block text-sm font-medium text-gray-700 mb-1">اسم الكاتب</label>
                                    <input
                                        id="blog-author"
                                        type="text"
                                        value={author}
                                        onChange={(e) => setAuthor(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500"
                                        placeholder="اسم الكاتب"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">صورة الغلاف</label>
                                    <input
                                        type="file"
                                        ref={coverInputRef}
                                        accept="image/*"
                                        className="hidden"
                                        aria-label="رفع صورة الغلاف"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleCoverUpload(file);
                                            e.target.value = '';
                                        }}
                                    />
                                    {coverImage ? (
                                        <div className="relative group">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={coverImage}
                                                alt="صورة الغلاف"
                                                className="w-full h-40 object-cover rounded-xl border border-gray-300"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-xl flex items-center justify-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => coverInputRef.current?.click()}
                                                    className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-100 transition"
                                                    disabled={uploadingCover}
                                                >
                                                    تغيير
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCoverImage('')}
                                                    className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition"
                                                >
                                                    حذف
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => coverInputRef.current?.click()}
                                            disabled={uploadingCover}
                                            className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-green-500 hover:text-green-600 transition cursor-pointer disabled:opacity-50"
                                        >
                                            {uploadingCover ? (
                                                <>
                                                    <Loader2 className="w-6 h-6 animate-spin" />
                                                    <span className="text-sm">جاري الرفع...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="w-6 h-6" />
                                                    <span className="text-sm">اضغط لرفع صورة الغلاف</span>
                                                    <span className="text-xs text-gray-300">JPG, PNG, WebP — حتى 5 ميجا</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* SEO (collapsible) */}
                            <details className="bg-gray-50 rounded-xl p-4 border">
                                <summary className="cursor-pointer font-medium text-gray-700 text-sm">إعدادات SEO (اختياري)</summary>
                                <div className="space-y-3 mt-4">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">عنوان SEO</label>
                                        <input
                                            type="text"
                                            value={seoTitle}
                                            onChange={(e) => setSeoTitle(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                            placeholder="عنوان مخصص لمحركات البحث"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">وصف SEO</label>
                                        <textarea
                                            value={seoDescription}
                                            onChange={(e) => setSeoDescription(e.target.value)}
                                            rows={2}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                            placeholder="وصف مخصص لمحركات البحث"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">النطاق المخصص (Domain)</label>
                                        <input
                                            type="text"
                                            dir="ltr"
                                            value={domain}
                                            onChange={(e) => setDomain(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                                            placeholder="blog.example.com"
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            اترك الحقل فارغًا لاستخدام النطاق الافتراضي. عند تحديده سيُستخدم كـ canonical ورابط OpenGraph.
                                        </p>
                                    </div>
                                </div>
                            </details>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-3 pt-4 border-t">
                                <button
                                    onClick={() => savePost('published')}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-6 py-3 bg-green-700 text-white rounded-xl hover:bg-green-800 transition font-medium disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                    نشر
                                </button>
                                <button
                                    onClick={() => savePost('draft')}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-medium disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    حفظ كمسودة
                                </button>
                                <button
                                    onClick={() => { setView('list'); resetForm(); }}
                                    className="flex items-center gap-2 px-6 py-3 text-gray-500 hover:text-gray-700 transition"
                                >
                                    <X className="w-4 h-4" />
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
