'use client';

import { useEffect, useState } from 'react';
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import { auth } from '@/lib/firebase';
import axios from '@/lib/axiosInstance';
import {
  TrendingUp,
  ShoppingCart,
  Star,
  Users,
  Activity,
  Calendar,
  Target,
  Award,
  Zap,
  Eye,
  Heart,
  Sparkles,
} from 'lucide-react';

type AnalyticsData = {
  totalOrders: number;
  totalReviews: number;
  positiveRate: number;
  ordersChart: { month: string; count: number }[];
  reviewsChart: { month: string; positive: number; negative: number }[];
};

const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  delay = 0,
  trend,
  subtitle,
  gradient,
}: {
  title: string;
  value: string | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  color: string;
  bgColor: string;
  delay?: number;
  trend?: string;
  subtitle?: string;
  gradient?: string;
}) => (
  <div
    className={`group relative bg-white rounded-3xl border border-gray-200/50 p-8 shadow-xl hover:shadow-2xl transition-all duration-700 transform hover:-translate-y-4 hover:scale-105 cursor-pointer overflow-hidden backdrop-blur-sm`}
    style={{
      animationDelay: `${delay}ms`,
      animation: 'slideInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      opacity: 0,
      transform: 'translateY(50px) rotateX(10deg)',
      perspective: '1000px',
    }}
  >
    {/* Animated Background Orbs */}
    <div className="absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-xl group-hover:scale-150 transition-all duration-1000" />
    <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-tr from-pink-400/20 to-orange-600/20 rounded-full blur-xl group-hover:scale-125 transition-all duration-1000 delay-200" />

    {/* Floating Particles */}
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-blue-400 rounded-full animate-pulse"
          style={{
            left: `${20 + i * 15}%`,
            top: `${10 + i * 10}%`,
            animationDelay: `${i * 200}ms`,
            animationDuration: '2s',
          }}
        />
      ))}
    </div>

    {/* Glass Morphism Effect */}
    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 backdrop-blur-sm" />

    <div className="relative z-10">
      <div className="flex items-center justify-between mb-6">
        <div
          className={`relative w-16 h-16 ${gradient || bgColor} rounded-2xl flex items-center justify-center shadow-2xl group-hover:shadow-3xl transition-all duration-500 group-hover:rotate-12 group-hover:scale-110 transform-gpu`}
        >
          {/* Icon Glow Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
          <Icon className={`w-8 h-8 ${color} relative z-10 group-hover:scale-110 transition-transform duration-300`} />

          {/* Pulsing Ring */}
          <div className="absolute inset-0 rounded-2xl border-2 border-white/30 group-hover:scale-125 group-hover:opacity-0 transition-all duration-500" />
        </div>

        {trend && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 group-hover:scale-105 transition-transform duration-300">
            <TrendingUp className="w-4 h-4 animate-bounce" />
            <span className="text-sm font-semibold">{trend}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors uppercase tracking-wider">
          {title}
        </h3>
        <p className={`text-4xl font-bold text-gray-900 group-hover:scale-110 transition-all duration-500 origin-right transform-gpu`}>
          {value}
        </p>
        {subtitle && <p className="text-sm text-gray-700 group-hover:text-gray-800 transition-colors font-medium">{subtitle}</p>}
      </div>
    </div>

    {/* Holographic Shine Effect */}
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1200 ease-out" />

    {/* 3D Border Effect */}
    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/20 via-transparent to-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
  </div>
);

const ChartCard = ({
  title,
  children,
  delay = 0,
  icon: Icon,
  subtitle,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  subtitle?: string;
}) => (
  <div
    className="relative bg-white rounded-3xl border border-gray-200/50 p-8 shadow-2xl hover:shadow-3xl transition-all duration-700 transform hover:-translate-y-2 hover:scale-[1.02] overflow-hidden backdrop-blur-sm group"
    style={{
      animationDelay: `${delay}ms`,
      animation: 'slideInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      opacity: 0,
      transform: 'translateY(50px) rotateX(5deg)',
      perspective: '1000px',
    }}
  >
    {/* Animated Background */}
    <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-purple-50/40 to-pink-50/60 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

    {/* Floating Orbs */}
    <div className="absolute -top-12 -right-12 w-40 h-40 bg-gradient-to-br from-blue-400/10 to-purple-600/10 rounded-full blur-2xl group-hover:scale-150 transition-all duration-1000" />
    <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-gradient-to-tr from-pink-400/10 to-orange-600/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-1000 delay-300" />

    <div className="relative z-10">
      <div className="flex items-center gap-4 mb-8">
        {Icon && (
          <div className="relative w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl group-hover:shadow-3xl transition-all duration-500 group-hover:rotate-6 group-hover:scale-110 transform-gpu">
            {/* Icon Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
            <Icon className="w-7 h-7 text-white relative z-10 group-hover:scale-110 transition-transform duration-300" />

            {/* Pulsing Ring */}
            <div className="absolute inset-0 rounded-2xl border-2 border-white/30 group-hover:scale-125 group-hover:opacity-0 transition-all duration-500" />
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 group-hover:text-gray-800 transition-colors">{title}</h2>
          {subtitle && <p className="text-sm text-gray-800 mt-1">{subtitle}</p>}
        </div>
      </div>

      <div className="group-hover:scale-[1.01] transition-transform duration-500 transform-gpu">{children}</div>
    </div>

    {/* Holographic Border */}
    <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-sm" />
  </div>
);

const MetricCard = ({
  label,
  value,
  icon: Icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  color: string;
  delay?: number;
}) => (
  <div
    className="group relative bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 p-6 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 overflow-hidden"
    style={{
      animationDelay: `${delay}ms`,
      animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      opacity: 0,
      transform: 'translateY(30px)',
    }}
  >
    {/* Background Gradient */}
    <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-white/50 group-hover:from-blue-50/50 group-hover:to-purple-50/50 transition-all duration-500" />

    <div className="relative z-10 flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800 mb-1">{label}</p>
        <p className={`text-2xl font-bold text-gray-900 group-hover:scale-105 transition-transform duration-300 origin-left`}>{value}</p>
      </div>
      <div
        className={`w-12 h-12 bg-gradient-to-br ${
          color.includes('emerald')
            ? 'from-emerald-400 to-emerald-600'
            : color.includes('blue')
            ? 'from-blue-400 to-blue-600'
            : 'from-purple-400 to-purple-600'
        } rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:rotate-12 group-hover:scale-110`}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
);

export default function DashboardAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Calculate dynamic metrics from real data
  const calculateMetrics = (analyticsData: AnalyticsData) => {
    const { totalOrders, totalReviews, positiveRate, ordersChart, reviewsChart } = analyticsData;

    // growth trends
    const prevOrders = ordersChart.length >= 2 ? ordersChart[ordersChart.length - 2]?.count || 0 : 0;
    const currOrders = ordersChart.length >= 1 ? ordersChart[ordersChart.length - 1]?.count || 0 : 0;
    const ordersGrowth = ((currOrders - prevOrders) / (prevOrders || 1)) * 100;

    const lastTotal =
      (reviewsChart[reviewsChart.length - 2]?.positive ?? 0) + (reviewsChart[reviewsChart.length - 2]?.negative ?? 0);
    const currTotal =
      (reviewsChart[reviewsChart.length - 1]?.positive ?? 0) + (reviewsChart[reviewsChart.length - 1]?.negative ?? 0);
    const reviewsGrowth = ((currTotal - lastTotal) / (lastTotal || 1)) * 100;

    const conversionRate = totalOrders > 0 ? (totalReviews / totalOrders) * 100 : 0;

    const avgOrdersPerMonth =
      ordersChart.length > 0 ? ordersChart.reduce((sum, item) => sum + item.count, 0) / ordersChart.length : 0;

    const avgReviewsPerMonth =
      reviewsChart.length > 0
        ? reviewsChart.reduce((sum, item) => sum + item.positive + item.negative, 0) / reviewsChart.length
        : 0;

    const bestMonth =
      ordersChart.length > 0
        ? ordersChart.reduce((max, item) => (item.count > max.count ? item : max), ordersChart[0])
        : null;

    const satisfactionScore = positiveRate / 20; // 100% -> 5.0

    const loyaltyRate = positiveRate > 80 ? 95 + (positiveRate - 80) / 4 : positiveRate * 1.2;

    const overallRating =
      positiveRate >= 90 ? 'ممتاز' : positiveRate >= 80 ? 'جيد جداً' : positiveRate >= 70 ? 'جيد' : positiveRate >= 60 ? 'مقبول' : 'يحتاج تحسين';

    return {
      ordersGrowth: Math.round(ordersGrowth * 10) / 10,
      reviewsGrowth: Math.round(reviewsGrowth * 10) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
      avgOrdersPerMonth: Math.round(avgOrdersPerMonth),
      avgReviewsPerMonth: Math.round(avgReviewsPerMonth),
      bestMonth: bestMonth?.month || '—',
      satisfactionScore: Math.round(satisfactionScore * 10) / 10,
      loyaltyRate: Math.round(loyaltyRate * 10) / 10,
      overallRating,
      responseRate: Math.round(conversionRate * 10) / 10,
    };
  };

  const metrics = data ? calculateMetrics(data) : null;

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        // حاول نجيب توكن المستخدم لو متاح
        const idToken = await auth.currentUser?.getIdToken().catch(() => undefined);
        const headers: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

        // 1) axios (بالهيدر لو عندنا توكن)
        const res = await axios.get('/api/store/dashboard', { headers });
        if (!cancelled) setData(res.data);
      } catch (err) {
        console.error('Dashboard API error (axios):', err);

        try {
          // 2) fetch fallback + نفس الهيدر
          const absolute =
            typeof window !== 'undefined'
              ? new URL('/api/store/dashboard', window.location.origin).toString()
              : '/api/store/dashboard';

          const idToken2 = await auth.currentUser?.getIdToken().catch(() => undefined);
          const headers2: Record<string, string> = idToken2 ? { Authorization: `Bearer ${idToken2}` } : {};

          const f = await fetch(absolute, { headers: headers2 });
          if (!f.ok) throw new Error(`fetch status ${f.status}`);
          const json = (await f.json()) as AnalyticsData;

          if (!cancelled) setData(json);
        } catch (e) {
          console.error('Dashboard API error (fetch fallback):', e);
          if (!cancelled) setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    async function getAI() {
      setAiLoading(true); 
      setAiError(null);
      
      try {
        // ✅ إضافة timeout للـ fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 ثانية
        
        const idToken = await auth.currentUser?.getIdToken().catch(() => undefined);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        };
        
        const r = await fetch('/api/ai/insights', {
          method: 'POST',
          headers,
          body: JSON.stringify({ data }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const j = await r.json();
        
        console.log("[AI Response]", j); // ✅ لوج للتأكد
        
        if (!cancelled) {
          if (j.ok && j.text) {
            setAiSummary(j.text);
          } else {
            setAiError(j.message || 'لم تتوفر التوصيات حالياً');
          }
        }
      } catch (e) {
        console.error("[AI Fetch Error]", e); // ✅ لوج الخطأ
        
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('aborted') || msg.includes('timeout')) {
            setAiError('انتهت مهلة الاتصال، حاول مرة أخرى');
          } else {
            setAiError('تعذر تحميل توصيات الذكاء الاصطناعي');
          }
        }
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    }
    
    getAI();
    
    return () => { cancelled = true; };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center space-y-8">
          {/* 3D Loading Animation */}
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin shadow-2xl" />
            <div
              className="absolute inset-0 w-20 h-20 border-4 border-transparent border-r-purple-600 rounded-full animate-spin shadow-2xl"
              style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
            />
            <div
              className="absolute inset-2 w-16 h-16 border-2 border-transparent border-b-pink-500 rounded-full animate-spin"
              style={{ animationDuration: '2s' }}
            />

            {/* Pulsing Center */}
            <div className="absolute inset-6 w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full animate-pulse shadow-lg" />
          </div>

          <div className="space-y-3">
            <p className="text-2xl font-bold text-gray-900 animate-pulse">جاري تحميل الإحصائيات</p>
            <p className="text-sm text-gray-800">تحليل البيانات وإعداد التقارير...</p>

            {/* Loading Progress Dots */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50">
        <div className="bg-white rounded-3xl border border-red-200/50 p-12 shadow-2xl text-center max-w-md transform hover:scale-105 transition-transform duration-300">
          <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <Activity className="w-10 h-10 text-white animate-pulse" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">تعذر تحميل البيانات</h3>
          <p className="text-gray-800 mb-6">حدث خطأ أثناء جلب الإحصائيات</p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const pieData = [
    { name: 'إيجابية', value: data.positiveRate, color: '#10b981' },
    { name: 'سلبية', value: 100 - data.positiveRate, color: '#ef4444' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 p-8 space-y-12">
      {/* AI Insights Card */}
      <div className="max-w-2xl mx-auto mb-10 w-full">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200/40 rounded-2xl p-6 shadow-xl flex flex-col gap-2 items-center animate-fadeIn">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="text-blue-500 w-6 h-6 animate-pulse" />
            <h2 className="text-lg font-bold text-blue-800">توصيات الذكاء الاصطناعي</h2>
          </div>
          {aiLoading && <div className="text-blue-500 animate-pulse">جاري التحليل...</div>}
          {!aiLoading && aiError && <div className="text-red-500">{aiError}</div>}
          {!aiLoading && !aiError && aiSummary && (
            <div className="whitespace-pre-line text-gray-800 text-md mt-2 text-center leading-relaxed">
              {aiSummary}
            </div>
          )}
          {!aiLoading && !aiError && !aiSummary && <div className="text-gray-800">لا توجد توصيات حالياً.</div>}
        </div>
      </div>
      {/* Animated Header */}
      <div className="text-center space-y-6 mb-16">
        <div
          className="inline-flex items-center gap-4 px-8 py-4 bg-white/80 backdrop-blur-sm rounded-full shadow-2xl border border-gray-200/50 hover:scale-105 transition-all duration-500"
          style={{
            animation: 'slideInDown 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
            opacity: 0,
            transform: 'translateY(-50px)',
          }}
        >
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            لوحة التحكم التحليلية المتقدمة
          </h1>
        </div>
        <p className="text-gray-800 max-w-3xl mx-auto text-lg leading-relaxed">
          تتبع أداء متجرك وتحليل بيانات العملاء والطلبات بتقنيات متقدمة وواجهة تفاعلية ثلاثية الأبعاد
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <StatCard
          title="إجمالي الطلبات"
          value={data.totalOrders.toLocaleString()}
          icon={ShoppingCart}
          color="text-white"
          bgColor="bg-emerald-50"
          gradient="bg-gradient-to-br from-emerald-400 to-emerald-600"
          delay={0}
          trend={metrics?.ordersGrowth ? `${metrics.ordersGrowth > 0 ? '+' : ''}${metrics.ordersGrowth}%` : undefined}
          subtitle="نمو مستمر هذا الشهر"
        />
        <StatCard
          title="إجمالي التقييمات"
          value={data.totalReviews.toLocaleString()}
          icon={Star}
          color="text-white"
          bgColor="bg-amber-50"
          gradient="bg-gradient-to-br from-amber-400 to-amber-600"
          delay={100}
          trend={metrics?.reviewsGrowth ? `${metrics.reviewsGrowth > 0 ? '+' : ''}${metrics.reviewsGrowth}%` : undefined}
          subtitle="معدل استجابة ممتاز"
        />
        <StatCard
          title="نسبة الإيجابية"
          value={`${data.positiveRate}%`}
          icon={Heart}
          color="text-white"
          bgColor="bg-rose-50"
          gradient="bg-gradient-to-br from-rose-400 to-rose-600"
          delay={200}
          trend={data.positiveRate >= 80 ? `+${Math.round((data.positiveRate - 75) * 0.5)}%` : undefined}
          subtitle="رضا العملاء متزايد"
        />
        <StatCard
          title="معدل التحويل"
          value={`${metrics?.conversionRate || 0}%`}
          icon={Target}
          color="text-white"
          bgColor="bg-purple-50"
          gradient="bg-gradient-to-br from-purple-400 to-purple-600"
          delay={300}
          trend={metrics?.conversionRate && metrics.conversionRate > 50 ? `+${Math.round((metrics.conversionRate - 50) * 0.2)}%` : undefined}
          subtitle="أداء استثنائي"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        {/* Orders AreaChart */}
        <ChartCard title="تحليل الطلبات الشهرية" subtitle="نمو وتطور المبيعات عبر الزمن" delay={400} icon={Eye}>
          <div className="h-96 group-hover:scale-[1.02] transition-transform duration-700 transform-gpu">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.ordersChart} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <defs>
                  <linearGradient id="orderAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity={0.1} />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: 'none',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    backdropFilter: 'blur(10px)',
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fill="url(#orderAreaGradient)" filter="url(#glow)" className="hover:opacity-80 transition-opacity duration-300" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Reviews Pie */}
        <ChartCard title="توزيع التقييمات التفاعلي" subtitle="نسب الرضا والتحسينات المطلوبة" delay={500} icon={Eye}>
          <div className="h-96 flex items-center justify-center">
            <div className="relative group-hover:scale-105 transition-transform duration-700 transform-gpu">
              <ResponsiveContainer width={350} height={350}>
                <PieChart>
                  <defs>
                    <linearGradient id="positiveGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="50%" stopColor="#059669" />
                      <stop offset="100%" stopColor="#047857" />
                    </linearGradient>
                    <linearGradient id="negativeGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="50%" stopColor="#dc2626" />
                      <stop offset="100%" stopColor="#b91c1c" />
                    </linearGradient>
                    <filter id="pieGlow">
                      <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <Pie data={pieData} cx={175} cy={175} innerRadius={80} outerRadius={140} paddingAngle={8} dataKey="value" className="drop-shadow-2xl" filter="url(#pieGlow)">
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? 'url(#positiveGradient)' : 'url(#negativeGradient)'}
                        className="hover:opacity-80 transition-all duration-300 cursor-pointer"
                        style={{ filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.1))' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: 'none',
                      borderRadius: '16px',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                      backdropFilter: 'blur(10px)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center badge */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center bg-white/90 backdrop-blur-sm rounded-full w-24 h-24 flex flex-col items-center justify-center shadow-2xl border border-gray-200/50">
                  <p className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 bg-clip-text text-transparent">{data.positiveRate}%</p>
                  <p className="text-xs text-gray-800 font-medium">إيجابية</p>
                </div>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Reviews Trend BarChart */}
      <ChartCard title="اتجاهات التقييمات المتقدمة" subtitle="تحليل شامل للتقييمات الإيجابية والسلبية" delay={600} icon={TrendingUp}>
        <div className="h-96 group-hover:scale-[1.01] transition-transform duration-700 transform-gpu">
          <ResponsiveContainer width="100%" height="100%">
            <ReBarChart data={data.reviewsChart} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <defs>
                <linearGradient id="positiveBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                  <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="negativeBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                  <stop offset="50%" stopColor="#f97316" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                </linearGradient>
                <filter id="barGlow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  borderRadius: '16px',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                  backdropFilter: 'blur(10px)',
                }}
              />
              <Bar dataKey="positive" fill="url(#positiveBarGradient)" radius={[8, 8, 0, 0]} filter="url(#barGlow)" className="hover:opacity-80 transition-opacity duration-300" />
              <Bar dataKey="negative" fill="url(#negativeBarGradient)" radius={[8, 8, 0, 0]} filter="url(#barGlow)" className="hover:opacity-80 transition-opacity duration-300" />
            </ReBarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Performance metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div
          className="relative bg-white/80 backdrop-blur-sm rounded-3xl border border-gray-200/50 p-8 shadow-2xl hover:shadow-3xl transition-all duration-700 transform hover:-translate-y-2 overflow-hidden group"
          style={{
            animationDelay: '700ms',
            animation: 'slideInLeft 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
            opacity: 0,
            transform: 'translateX(-50px)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl group-hover:rotate-6 group-hover:scale-110 transition-all duration-500">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">الأداء الشهري</h3>
                <p className="text-gray-800">متوسط الطلبات والتقييمات</p>
              </div>
            </div>
            <div className="space-y-4">
              <MetricCard label="متوسط الطلبات" value={metrics?.avgOrdersPerMonth || 0} icon={ShoppingCart} color="text-gray-900" delay={800} />
              <MetricCard label="متوسط التقييمات" value={metrics?.avgReviewsPerMonth || 0} icon={Star} color="text-gray-900" delay={900} />
            </div>
          </div>
        </div>

        <div
          className="relative bg-white/80 backdrop-blur-sm rounded-3xl border border-gray-200/50 p-8 shadow-2xl hover:shadow-3xl transition-all duration-700 transform hover:-translate-y-2 overflow-hidden group"
          style={{
            animationDelay: '800ms',
            animation: 'slideInRight 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
            opacity: 0,
            transform: 'translateX(50px)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 via-transparent to-pink-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl group-hover:rotate-6 group-hover:scale-110 transition-all duration-500">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">رضا العملاء</h3>
                <p className="text-gray-800">مؤشرات الجودة والأداء</p>
              </div>
            </div>

            <div className="space-y-4">
              <MetricCard label="معدل الاستجابة" value={`${metrics?.responseRate || 0}%`} icon={Zap} color="text-blue-600" delay={1000} />
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 p-6 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">درجة الرضا</span>
                  <div className="flex items-center gap-3">
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-5 h-5 transition-all duration-300 ${
                            i < Math.round(metrics?.satisfactionScore || 0) ? 'text-yellow-400 fill-current hover:scale-110' : 'text-gray-300'
                          }`}
                          style={{ animationDelay: `${i * 100}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-lg font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
                      {(metrics?.satisfactionScore || 0).toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 group overflow-hidden"
          style={{ animationDelay: '900ms', animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards', opacity: 0, transform: 'translateY(30px)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent group-hover:from-white/20 transition-all duration-500" />
          <div className="relative z-10">
            <Award className="w-8 h-8 mb-3 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300" />
            <p className="text-sm opacity-90 mb-1">أفضل شهر</p>
            <p className="text-xl font-bold">{metrics?.bestMonth || '—'}</p>
          </div>
        </div>

        <div
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 group overflow-hidden"
          style={{ animationDelay: '1000ms', animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards', opacity: 0, transform: 'translateY(30px)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent group-hover:from-white/20 transition-all duration-500" />
          <div className="relative z-10">
            <TrendingUp className="w-8 h-8 mb-3 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300" />
            <p className="text-sm opacity-90 mb-1">نمو متوقع</p>
            <p className="text-xl font-bold">
              {metrics?.ordersGrowth ? `${metrics.ordersGrowth > 0 ? '+' : ''}${(metrics.ordersGrowth * 1.2).toFixed(1)}%` : '+0.0%'}
            </p>
          </div>
        </div>

        <div
          className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 group overflow-hidden"
          style={{ animationDelay: '1100ms', animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards', opacity: 0, transform: 'translateY(30px)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent group-hover:from-white/20 transition-all duration-500" />
          <div className="relative z-10">
            <Heart className="w-8 h-8 mb-3 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300" />
            <p className="text-sm opacity-90 mb-1">ولاء العملاء</p>
            <p className="text-xl font-bold">{metrics?.loyaltyRate.toFixed(1) || '0.0'}%</p>
          </div>
        </div>

        <div
          className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl p-6 text-white shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 group overflow-hidden"
          style={{ animationDelay: '1200ms', animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards', opacity: 0, transform: 'translateY(30px)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent group-hover:from-white/20 transition-all duration-500" />
          <div className="relative z-10">
            <Sparkles className="w-8 h-8 mb-3 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300" />
            <p className="text-sm opacity-90 mb-1">تقييم عام</p>
            <p className="text-xl font-bold">{metrics?.overallRating || 'غير متاح'}</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(50px) rotateX(10deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotateX(0deg);
          }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-50px) rotateX(-10deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotateX(0deg);
          }
        }

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-50px) rotateY(10deg);
          }
          to {
            opacity: 1;
            transform: translateX(0) rotateY(0deg);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(50px) rotateY(-10deg);
          }
          to {
            opacity: 1;
            transform: translateX(0) rotateY(0deg);
          }
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(5deg);
          }
        }

        @keyframes pulse-glow {
          0%,
          100% {
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
          }
          50% {
            box-shadow: 0 0 40px rgba(59, 130, 246, 0.6);
          }
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
