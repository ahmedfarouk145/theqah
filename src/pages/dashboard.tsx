// src/pages/dashboard.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import FeedbackWidget from '@/components/FeedbackWidget';
import ReAuthBanner from '@/components/dashboard/ReAuthBanner';
import { useFlag } from '@/features/flags/useFlag';
import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axiosInstance';
import { motion } from 'framer-motion';
import { Loader2, Lock } from 'lucide-react';
import Link from 'next/link';

// Dynamic imports with loading states
const DashboardAnalytics = dynamic(() => import('@/components/dashboard/Analytics'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>,
  ssr: false
});
const OrdersTab = dynamic(() => import('@/components/dashboard/OrdersTab'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
});
const ReviewsTab = dynamic(() => import('@/components/dashboard/Reviews'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
});
const SettingsTab = dynamic(() => import('@/components/dashboard/StoreSettings'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
});
const SupportTab = dynamic(() => import('@/components/dashboard/Support'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
});
const PendingReviewsTab = dynamic(() => import('@/features/reviews/PendingReviewsTab'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
});

const tabs = ['الإحصائيات', 'الطلبات', 'التقييمات', 'الإعدادات', 'المساعدة'] as const;
type Tab = (typeof tabs)[number] | 'التقييمات المعلقة';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function DashboardPage() {
  const dashboardV2Enabled = useFlag('DASHBOARD_V2');
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dash_active_tab') as Tab) || 'الإحصائيات';
    }
    return 'الإحصائيات';
  });

  const [storeUid, setStoreUid] = useState<string | undefined>(undefined);
  const [storeName, setStoreName] = useState<string | undefined>(undefined);
  const [storeLoading, setStoreLoading] = useState(true);

  useEffect(() => { localStorage.setItem('dash_active_tab', activeTab); }, [activeTab]);

  // حدّد storeUid من query أو cookie
  useEffect(() => {
    const u = new URL(window.location.href);
    const qUid = u.searchParams.get('uid');
    const cUid = getCookie('salla_store_uid');
    setStoreUid(qUid || cUid || undefined);
  }, []);

  // جلب اسم المتجر (اختياري — يحاول عدة مسارات)
  useEffect(() => {
    const run = async () => {
      setStoreLoading(true);
      try {
        // حاول من الـ status أولاً (لأن عندنا uid/كوكي)
        let name: string | undefined;
        const statusUrl = storeUid ? `/api/salla/status?uid=${encodeURIComponent(storeUid)}` : '/api/salla/status';
        try {
          const st = await axios.get(statusUrl);
          name =
            st.data?.storeName ??
            st.data?.salla?.storeName ??
            st.data?.integration?.salla?.storeName ??
            undefined;
        } catch { /* ignore */ }

        // fallback: APIs محلية تتطلّب توكن (لو عندك)
        if (!name && user) {
          const idToken = await user.getIdToken(true);
          const tryProfileEndpoints = ['/api/store/profile', '/api/store/info', '/api/store'];
          for (const ep of tryProfileEndpoints) {
            try {
              const res = await axios.get(ep, { headers: { Authorization: `Bearer ${idToken}` } });
              name =
                res.data?.storeName ??
                res.data?.name ??
                res.data?.store?.name ??
                res.data?.profile?.storeName;
              if (name) break;
            } catch { /* ignore */ }
          }
        }

        setStoreName(name);
      } finally {
        setStoreLoading(false);
      }
    };
    run();
  }, [storeUid, user]);

  const headerRight = useMemo(() => {
    if (storeLoading) {
      return <span className="text-gray-400 text-sm">جارٍ تحميل بيانات المتجر…</span>;
    }
    if (storeName) {
      return (
        <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
          المتجر: {storeName}
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200">
        المتجر: غير محدد
      </span>
    );
  }, [storeLoading, storeName]);

  // ملاحظة: لو حاب تمنع الوصول بدون لوجين، احتفظ بالشرط التالي:
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <p className="text-gray-600">جارٍ التحقق من حالة تسجيل الدخول…</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white border rounded-2xl p-8 shadow-lg text-center"
          dir="rtl"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">يرجى تسجيل الدخول</h2>
          <p className="text-gray-600 mb-6">مطلوب تسجيل الدخول للوصول للوحة التحكم.</p>
          <Link 
            href="/login"
            className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
          >
            تسجيل الدخول
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-green-800">لوحة التحكم</h1>
        {headerRight}
      </div>

      {/* C6: Re-authorization Banner */}
      <ReAuthBanner storeUid={storeUid} />

      <div className="flex space-x-2 mb-6 rtl:space-x-reverse">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md font-medium border transition ${
              activeTab === tab
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
        {dashboardV2Enabled && (
          <button
            onClick={() => setActiveTab('التقييمات المعلقة')}
            className={`px-4 py-2 rounded-md font-medium border transition ${
              activeTab === 'التقييمات المعلقة'
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
            }`}
          >
            التقييمات المعلقة
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        {activeTab === 'الإحصائيات' && <DashboardAnalytics />}
        {activeTab === 'الطلبات' && <OrdersTab />}
        {activeTab === 'التقييمات' && <ReviewsTab storeName={storeName} />}
        {activeTab === 'التقييمات المعلقة' && dashboardV2Enabled && <PendingReviewsTab />}
        {/* ✅ مرّر storeUid و storeName هنا */}
        {activeTab === 'الإعدادات' && <SettingsTab storeUid={storeUid} storeName={storeName} />}
        {activeTab === 'المساعدة' && <SupportTab />}
      </div>

      {/* Feedback Widget - Available on all tabs */}
      <FeedbackWidget userName={storeName} />
    </div>
  );
}
