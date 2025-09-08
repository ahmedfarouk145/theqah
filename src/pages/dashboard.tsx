// src/pages/dashboard.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAnalytics from '@/components/dashboard/Analytics';
import OrdersTab from '@/components/dashboard/OrdersTab';
import ReviewsTab from '@/components/dashboard/Reviews';
import SettingsTab from '@/components/dashboard/StoreSettings';
import SupportTab from '@/components/dashboard/Support';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase';
import axios from '@/lib/axiosInstance';

const tabs = ['الإحصائيات', 'الطلبات', 'التقييمات', 'الإعدادات', 'المساعدة'] as const;
type Tab = (typeof tabs)[number];

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dash_active_tab') as Tab) || 'الإحصائيات';
    }
    return 'الإحصائيات';
  });

  const [authLoading, setAuthLoading] = useState(true);
  const [userPresent, setUserPresent] = useState(false);

  const [storeUid, setStoreUid] = useState<string | undefined>(undefined);
  const [storeName, setStoreName] = useState<string | undefined>(undefined);
  const [storeLoading, setStoreLoading] = useState(true);

  useEffect(() => { localStorage.setItem('dash_active_tab', activeTab); }, [activeTab]);

  // مراقبة تسجيل الدخول (لو عندك صلاحيات إضافية بعد اللوجين)
  useEffect(() => {
    const auth = getAuth(app);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserPresent(!!u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

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
        if (!name) {
          const auth = getAuth(app);
          const user = auth.currentUser;
          if (user) {
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
        }

        setStoreName(name);
      } finally {
        setStoreLoading(false);
      }
    };
    run();
  }, [storeUid]);

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
  if (authLoading) return <p>جارٍ التحقق من حالة تسجيل الدخول…</p>;
  if (!userPresent) {
    // تقدر تخليه يسمح بعرض الإعدادات الأساسية حتى بدون لوجين لو حاب
    return <p className="text-red-600">مطلوب تسجيل الدخول للوصول للوحة التحكم.</p>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-green-800">لوحة التحكم</h1>
        {headerRight}
      </div>

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
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        {activeTab === 'الإحصائيات' && <DashboardAnalytics />}
        {activeTab === 'الطلبات' && <OrdersTab />}
        {activeTab === 'التقييمات' && <ReviewsTab storeName={storeName} />}
        {/* ✅ مرّر storeUid و storeName هنا */}
        {activeTab === 'الإعدادات' && <SettingsTab storeUid={storeUid} storeName={storeName} />}
        {activeTab === 'المساعدة' && <SupportTab />}
      </div>
    </div>
  );
}
