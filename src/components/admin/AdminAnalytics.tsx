'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { app } from '@/lib/firebase';
import axios from '@/lib/axiosInstance';
import { isAxiosError } from 'axios';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts';

interface Stats {
  totalStores: number;
  totalReviews: number;
  totalAlerts: number;
  publishedReviews: number;
  pendingReviews: number;
}

interface FetchError {
  message: string;
  code?: number;
}

const STAT_CARDS: Array<{
  key: keyof Stats;
  title: string;
  icon: string;
  gradient: string;
  bg: string;
  text: string;
}> = [
  { key: 'totalStores', title: 'إجمالي المتاجر', icon: '🏪', gradient: 'from-blue-400 to-blue-600', bg: 'bg-blue-50', text: 'text-blue-600' },
  { key: 'totalReviews', title: 'إجمالي التقييمات', icon: '⭐', gradient: 'from-purple-400 to-purple-600', bg: 'bg-purple-50', text: 'text-purple-600' },
  { key: 'publishedReviews', title: 'التقييمات المنشورة', icon: '✅', gradient: 'from-green-400 to-green-600', bg: 'bg-green-50', text: 'text-green-600' },
  { key: 'totalAlerts', title: 'البلاغات', icon: '🚨', gradient: 'from-red-400 to-red-600', bg: 'bg-red-50', text: 'text-red-600' },
];

const AuthLoadingState = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
      <p className="text-lg text-gray-600">جاري التحقق من الهوية...</p>
    </div>
  </div>
);

const UnauthorizedState = () => (
  <div className="text-center p-8">
    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
      <div className="text-red-500 text-6xl mb-4">🔒</div>
      <p className="text-red-600 text-lg font-medium">يرجى تسجيل الدخول للوصول لهذه الصفحة</p>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-6">
    <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        <span className="animate-pulse">📊</span>
        <span className="mr-3">إحصائيات النظام</span>
      </h2>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-6 shadow-lg border animate-pulse">
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-8 bg-gray-300 rounded w-16"></div>
            </div>
            <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
          </div>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-6 shadow-lg animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

const ErrorState = ({ error, onRetry }: { error: FetchError; onRetry: () => void }) => (
  <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
    <div className="text-red-500 text-6xl mb-4">❌</div>
    <p className="text-red-600 mb-4 text-lg">{error.message}</p>
    <button
      onClick={onRetry}
      className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
    >
      إعادة المحاولة
    </button>
  </div>
);

const StatCard = ({ title, value, icon, gradient, bg, text }: { title: string; value: number; icon: string; gradient: string; bg: string; text: string }) => (
  <div className={`${bg} rounded-xl p-6 shadow-lg border-2 border-white hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1`}>
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className={`text-3xl font-bold ${text} tabular-nums`}>
          {value.toLocaleString('ar-EG')}
        </p>
      </div>
      <div className={`w-16 h-16 bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center text-white text-2xl shadow-lg`}>
        {icon}
      </div>
    </div>
  </div>
);

export default function AdminAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [animatedStats, setAnimatedStats] = useState<Stats>({
    totalStores: 0, totalReviews: 0, totalAlerts: 0, publishedReviews: 0, pendingReviews: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get<Stats>('/api/admin/dashboard');
      setStats(res.data);
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        setError({
          message: err.response?.status === 401
            ? 'غير مخول للوصول. يرجى التأكد من صلاحيات المشرف.'
            : 'حدث خطأ أثناء تحميل الإحصائيات',
          code: err.response?.status,
        });
      } else {
        setError({ message: 'حدث خطأ غير متوقع أثناء التحميل' });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) fetchStats();
  }, [authLoading, user, fetchStats]);

  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!stats) return;
    const duration = 2000;
    const start = performance.now();

    const animate = (time: number) => {
      const progress = Math.min((time - start) / duration, 1);
      setAnimatedStats({
        totalStores: Math.floor(progress * stats.totalStores),
        totalReviews: Math.floor(progress * stats.totalReviews),
        totalAlerts: Math.floor(progress * stats.totalAlerts),
        publishedReviews: Math.floor(progress * stats.publishedReviews),
        pendingReviews: Math.floor(progress * stats.pendingReviews),
      });
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [stats]);

  /** ----------------------------------------------------------------
   *  Hooks that derive view-data (MUST be before any early returns)
   *  ---------------------------------------------------------------- */
  const reviewStatusData = useMemo(
    () => ([
      { name: 'منشورة', value: animatedStats.publishedReviews, color: '#10B981' },
      { name: 'معلقة',  value: animatedStats.pendingReviews,    color: '#F59E0B' },
    ]),
    [animatedStats.publishedReviews, animatedStats.pendingReviews]
  );

  const overviewData = useMemo(
    () => ([
      { name: 'المتاجر',   value: animatedStats.totalStores,   color: '#3B82F6' },
      { name: 'التقييمات', value: animatedStats.totalReviews,  color: '#8B5CF6' },
      { name: 'البلاغات',  value: animatedStats.totalAlerts,   color: '#EF4444' },
    ]),
    [animatedStats.totalStores, animatedStats.totalReviews, animatedStats.totalAlerts]
  );

  const trendData = useMemo(
    () => ([
      { name: 'المتاجر',            value: animatedStats.totalStores },
      { name: 'التقييمات المنشورة', value: animatedStats.publishedReviews },
      { name: 'التقييمات المعلقة',  value: animatedStats.pendingReviews },
      { name: 'البلاغات',           value: animatedStats.totalAlerts },
    ]),
    [
      animatedStats.totalStores,
      animatedStats.publishedReviews,
      animatedStats.pendingReviews,
      animatedStats.totalAlerts
    ]
  );

  /** -----------------------
   *  Early returns (safe)
   *  ---------------------- */
  if (authLoading) return <AuthLoadingState />;
  if (!user) return <UnauthorizedState />;
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} onRetry={fetchStats} />;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-50 via-blue-50 to-purple-50 rounded-xl p-6 border">
        <h2 className="text-3xl font-bold text-green-800 flex items-center mb-2">
          <span className="animate-bounce mr-3">📊</span>
          إحصائيات النظام
        </h2>
        <p className="text-gray-600">نظرة شاملة على أداء المنصة</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {STAT_CARDS.map(({ key, title, icon, gradient, bg, text }) => (
          <StatCard
            key={key}
            title={title}
            value={animatedStats[key]}
            icon={icon}
            gradient={gradient}
            bg={bg}
            text={text}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-lg border">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">📈</span>
            حالة التقييمات
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={reviewStatusData} cx="50%" cy="50%" outerRadius={100} innerRadius={60} paddingAngle={5} dataKey="value">
                {reviewStatusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value: number) => [value.toLocaleString('ar-EG'), '']} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">📊</span>
            نظرة عامة
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={overviewData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#6B7280" />
              <YAxis tick={{ fontSize: 12 }} stroke="#6B7280" />
              <Tooltip formatter={(value: number) => [value.toLocaleString('ar-EG'), '']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {overviewData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-lg border">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">📈</span>
          اتجاه البيانات
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#6B7280" />
            <YAxis tick={{ fontSize: 12 }} stroke="#6B7280" />
            <Tooltip formatter={(value: number) => [value.toLocaleString('ar-EG'), '']} />
            <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={3} dot={{ r: 6, fill: '#10B981' }} activeDot={{ r: 8, fill: '#059669' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
