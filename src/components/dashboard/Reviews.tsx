// src/components/dashboard/Reviews.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, LineChart, Line, Tooltip, CartesianGrid
} from 'recharts';

type Review = {
  id: string;
  productId?: string;
  stars: number;
  text?: string;
  comment?: string;
  createdAt?: number | string;
  buyerVerified?: boolean;
  status?: 'pending' | 'published' | 'rejected';
};

type TabId = 'overview' | 'analytics' | 'table';
type FilterId = 'all' | 'published' | 'pending';

const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const tabs: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'overview', label: 'نظرة عامة', icon: '📊' },
  { id: 'analytics', label: 'التحليلات', icon: '📈' },
  { id: 'table', label: 'الجدول', icon: '📋' },
];

function toTs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : Date.parse(v);
  }
  return 0;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());
  return false;
}

function normalizeReview(raw: Record<string, unknown>): Review {
  const id = String(raw['id'] ?? raw['_id'] ?? raw['reviewId'] ?? raw['docId'] ?? '');
  const productId = (raw['productId'] ?? raw['product_id']) as string | undefined;
  const starsRaw = raw['stars'];
  const stars = typeof starsRaw === 'number' ? starsRaw : Number(starsRaw ?? 0);
  const createdAt =
    toTs(raw['createdAt'] ?? raw['created'] ?? raw['timestamp'] ?? raw['created_at']) || Date.now();

  // Read buyerVerified from multiple possible field names, including trustedBuyer variants
  const bvCandidate =
    raw['buyerVerified'] ??
    raw['trustedBuyer'] ??
    raw['trusted_buyer'] ??
    raw['buyer_trusted'] ??
    raw['verified'] ??
    raw['isVerified'] ??
    raw['verifiedBuyer'] ??
    raw['buyer_verified'];

  const buyerVerified = toBool(bvCandidate);
  const text = (raw['text'] ?? raw['comment'] ?? '') as string | undefined;
  const comment = (raw['comment'] as string | undefined) ?? undefined;
  const status = raw['status'] as Review['status'] | undefined;

  return { id, productId, stars, text, comment, createdAt, buyerVerified, status };
}

export default function ReviewsTab({ storeName }: { storeName?: string }) {
  const { token, loading: authLoading } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLogo, setShowLogo] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');
  const [filter, setFilter] = useState<FilterId>('all');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchReviews = useCallback(async () => {
    if (authLoading) return;
    if (!token) {
      if (mountedRef.current) {
        setLoading(false);
        setError('غير مصرح: الرجاء تسجيل الدخول.');
      }
      return;
    }

    try {
      if (mountedRef.current) { setLoading(true); setError(''); }

      const res = await axios.get('/api/reviews/list', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const items = (res.data?.items ?? res.data?.reviews ?? []) as unknown[];
      const normalized = (Array.isArray(items) ? items : [])
        .map((r) => normalizeReview((r ?? {}) as Record<string, unknown>))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

      if (mountedRef.current) setReviews(normalized);
    } catch (err: unknown) {
      const status = isAxiosError(err) ? err.response?.status ?? 0 : 0;
      if (status === 401) {
        try {
          const auth = getAuth(app);
          if (auth.currentUser) {
            const fresh = await auth.currentUser.getIdToken(true);
            const res2 = await axios.get('/api/reviews/list', {
              headers: { Authorization: `Bearer ${fresh}` },
            });
            const items2 = (res2.data?.items ?? res2.data?.reviews ?? []) as unknown[];
            const normalized2 = (Array.isArray(items2) ? items2 : [])
              .map((r) => normalizeReview((r ?? {}) as Record<string, unknown>))
              .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
            if (mountedRef.current) setReviews(normalized2);
            return;
          }
        } catch { /* ignore */ }
      }
      console.error('Error loading reviews:', err);
      if (mountedRef.current) setError('حدث خطأ أثناء تحميل التقييمات');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [authLoading, token]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const fmtDate = (v?: number | string) => {
    if (v == null) return '-';
    const n = typeof v === 'string' ? Number(v) : v;
    const d = Number.isFinite(n) ? new Date(Number(n)) : new Date(v as string);
    if (isNaN(d.getTime())) return '-';
    try { return format(d, 'dd MMM yyyy', { locale: arSA }); }
    catch { return d.toLocaleDateString(); }
  };

  const isPublished = (r: Review) => (r.status ? r.status === 'published' : true);

  // Analytics
  const stats = {
    total: reviews.length,
    published: reviews.filter((r) => isPublished(r)).length,
    verified: reviews.filter((r) => !!r.buyerVerified).length,
    avg: reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + (r.stars || 0), 0) / reviews.length).toFixed(1)
      : '0',
  };

  type MonthAgg = { name: string; reviews: number; avg: number; total: number };
  const chartData = {
    ratings: [1, 2, 3, 4, 5].map((star) => ({
      rating: `${star}★`,
      count: reviews.filter((r) => r.stars === star).length,
    })),
    monthly: Object.values(
      reviews.reduce<Record<string, MonthAgg>>((acc, review) => {
        const date = new Date(toTs(review.createdAt));
        const key = format(date, 'yyyy-MM');
        const name = format(date, 'MMM', { locale: arSA });
        if (!acc[key]) acc[key] = { name, reviews: 0, avg: 0, total: 0 };
        acc[key].reviews += 1;
        acc[key].total += review.stars || 0;
        acc[key].avg = acc[key].total / acc[key].reviews;
        return acc;
      }, {})
    ).slice(-6),
  };

  const filtered = reviews.filter((r) =>
    filter === 'all' ? true : filter === 'published' ? isPublished(r) : !isPublished(r)
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600"></div>
            <div className="absolute inset-2 border-4 border-purple-200 rounded-full animate-ping border-t-purple-600"></div>
          </div>
          <h3 className="text-2xl font-bold text-gray-800 animate-pulse">جاري التحميل...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
        <div className="bg-white p-12 rounded-3xl shadow-2xl text-center max-w-md transform hover:scale-105 transition-all duration-300">
          <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-pink-600 rounded-full mx-auto mb-6 flex items-center justify-center animate-bounce">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-red-800 mb-4">خطأ في التحميل</h3>
          <p className="text-red-600 mb-6">{error}</p>
          <button
            onClick={fetchReviews}
            className="px-8 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl hover:from-red-600 hover:to-pink-700 transition-all duration-300 transform hover:scale-105"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white p-12 rounded-3xl shadow-2xl text-center max-w-lg transform hover:scale-105 transition-all duration-500">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse">
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h3 className="text-3xl font-bold text-gray-800 mb-4">لا توجد تقييمات</h3>
          <p className="text-gray-600 text-lg">ابدأ في جمع تقييمات عملائك الآن</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl relative">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-gray-900 to-purple-800 bg-clip-text text-transparent">
                  لوحة التقييمات الذكية
                </h1>
                <p className="text-gray-600 text-lg">إدارة وتحليل التقييمات بذكاء</p>
              </div>
            </div>

            {storeName && (
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-6 py-3 rounded-2xl border border-blue-200/50">
                <span className="text-blue-700 font-bold">المتجر: {storeName}</span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-8 flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all duration-300 transform hover:scale-105 ${
                  tab === t.id
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[
            { title: 'إجمالي التقييمات', value: stats.total, icon: '⭐', bg: 'from-blue-50 to-cyan-50' },
            { title: 'التقييمات المنشورة', value: stats.published, icon: '✅', bg: 'from-emerald-50 to-teal-50' },
            { title: 'المشترون الموثقون', value: stats.verified, icon: '🛡️', bg: 'from-amber-50 to-orange-50' },
            { title: 'متوسط التقييم', value: stats.avg, icon: '🌟', bg: 'from-purple-50 to-pink-50' },
          ].map((stat) => (
            <div
              key={stat.title}
              className={`bg-gradient-to-br ${stat.bg} p-6 rounded-3xl border shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 hover:-translate-y-2`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg">
                  {stat.icon}
                </div>
                <div className="text-emerald-600 text-sm font-bold bg-emerald-100 px-2 py-1 rounded-lg">+12%</div>
              </div>
              <p className="text-gray-600 text-sm font-medium">{stat.title}</p>
              <p className="text-3xl font-black">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        {tab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border shadow-xl">
              <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">📊 توزيع التقييمات</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.ratings}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="rating" tick={{ fill: '#666', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#666', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="count" fill="url(#gradient1)" radius={[8, 8, 0, 0]} />
                  <defs>
                    <linearGradient id="gradient1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#1E40AF" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border shadow-xl">
              <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">🥧 نسب التقييمات</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={chartData.ratings} cx="50%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={5} dataKey="count">
                    {chartData.ratings.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === 'analytics' && (
          <div className="space-y-8">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border shadow-xl">
              <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">📈 الاتجاه الشهري</h3>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={chartData.monthly}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#666', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="reviews" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#areaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border shadow-xl">
              <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">⭐ متوسط التقييم</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 12 }} />
                  <YAxis domain={[0, 5]} tick={{ fill: '#666', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="#10B981"
                    strokeWidth={4}
                    strokeLinecap="round"
                    dot={{ fill: '#10B981', strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === 'table' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl rounded-2xl p-6 border shadow-lg">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterId)}
                className="px-4 py-2 rounded-xl border focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">جميع التقييمات</option>
                <option value="published">المنشورة</option>
                <option value="pending">المعلقة</option>
              </select>
              <div className="flex gap-3">
                <button
                  onClick={fetchReviews}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl hover:from-gray-200 hover:to-gray-300 transition-all duration-300 transform hover:scale-105"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  تحديث
                </button>

                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/api/reviews/export-csv"
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 transform hover:scale-105"
                >
                  CSV
                </a>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/api/reviews/export-pdf"
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl hover:from-red-600 hover:to-pink-700 transition-all duration-300 transform hover:scale-105"
                >
                  PDF
                </a>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl border shadow-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-800 via-blue-900 to-purple-900 text-white">
                      {['📦 المنتج', '⭐ التقييم', '💬 التعليق', '📅 التاريخ', '🛡️ التحقق', '📊 الحالة'].map((h) => (
                        <th key={h} className="px-6 py-4 font-bold text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => {
                      const text = r.text ?? r.comment ?? '';
                      return (
                        <tr
                          key={r.id}
                          className={`group hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-300 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
                              <span className="font-semibold text-gray-800">
                                {r.productId || <span className="text-gray-400 italic">غير محدد</span>}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex text-amber-400">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <svg key={star} className={`w-4 h-4 ${star <= (r.stars || 0) ? 'text-amber-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                  </svg>
                                ))}
                              </div>
                              <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">{r.stars || 0}/5</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="max-w-xs group-hover:max-w-none relative">
                              {text ? <p className="truncate text-gray-700 cursor-help" title={text}>{text}</p> : <span className="text-gray-400 italic">لا يوجد</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                              <span className="font-medium">{fmtDate(r.createdAt)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {r.buyerVerified ? (
                              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-2 border-emerald-200 px-3 py-1 rounded-2xl text-xs font-bold">
                                {showLogo && (
                                  <Image
                                    src="/logo.png"
                                    alt="شعار"
                                    width={14}
                                    height={14}
                                    className="rounded-full"
                                    onError={() => setShowLogo(false)}
                                  />
                                )}
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                موثق
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2 bg-gray-50 text-gray-500 border px-3 py-1 rounded-2xl text-xs">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                غير موثق
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isPublished(r) ? (
                              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border-2 border-green-200 px-3 py-1 rounded-2xl text-xs font-bold">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                منشور
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2 bg-gray-50 text-gray-600 border px-3 py-1 rounded-2xl text-xs">
                                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                مخفي
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={fetchReviews}
        className="fixed bottom-8 right-8 w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full shadow-2xl hover:shadow-3xl transform hover:scale-110 transition-all duration-300 flex items-center justify-center group z-50"
      >
        <svg className="w-6 h-6 group-hover:animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}
