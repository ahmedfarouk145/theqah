// src/pages/dashboard.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import DashboardAnalytics from '@/components/dashboard/Analytics';
import OrdersTab from '@/components/dashboard/OrdersTab';
import ReviewsTab from '@/components/dashboard/Reviews';
import SettingsTab from '@/components/dashboard/StoreSettings';
import SupportTab from '@/components/dashboard/Support';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { app } from '@/lib/firebase';

const tabs = ['الإحصائيات', 'الطلبات', 'التقييمات', 'الإعدادات', 'المساعدة'] as const;
type Tab = (typeof tabs)[number];

type SallaStatus = {
  ok?: boolean;
  connected?: boolean;
  uid?: string | null;
  storeId?: string | number | null;
  storeName?: string | null;
  domain?: string | null;
  reason?: string | null;
};
//eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null }> {
  const r = await fetch(url, init);
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  let j: any = null;
  try { j = await r.json(); } catch { j = null; }
  const data = (j && (j.data ?? j)) as T | null;
  return { ok: r.ok, data };
}

export default function DashboardPage() {
  const router = useRouter();

  // حفظ التبويب
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dash_active_tab') as Tab) || 'الإحصائيات';
    }
    return 'الإحصائيات';
  });
  useEffect(() => {
    localStorage.setItem('dash_active_tab', activeTab);
  }, [activeTab]);

  // auth state
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const auth = getAuth(app);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // بيانات المتجر
  const [storeName, setStoreName] = useState<string | undefined>(undefined);
  const [storeUid, setStoreUid] = useState<string | undefined>(undefined);
  const [storeLoading, setStoreLoading] = useState(true);

  const fromSalla = router.query.salla === 'connected';
  const uidFromQuery = typeof router.query.uid === 'string' ? router.query.uid : undefined;
  const onboardingToken = typeof router.query.t === 'string' ? router.query.t : undefined;

  // وضع: جاي من سلة من غير لوجين → اعرض الكارت واقرأ الحالة مباشرة
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!fromSalla || !uidFromQuery) { setStoreLoading(false); return; }
      setStoreLoading(true);
      const { data } = await fetchJson<SallaStatus>(`/api/salla/status?uid=${encodeURIComponent(uidFromQuery)}`);
      if (!mounted) return;
      setStoreUid(uidFromQuery);
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (data as any)?.storeName ?? null;
      if (typeof name === 'string' && name.trim()) setStoreName(name.trim());
      setStoreLoading(false);
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSalla, uidFromQuery]);

  // وضع: لوجين عادي → سيب بقية الداشبورد يشتغل بالطريقة المعتادة (لو عايز، أضف هنا جلب /api/store/info بالتوكن)
  // … تقدر تستخدم نفس لوجيكك السابق هنا …

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

  // شاشة “تم الربط” لو جاي من سلة ومفيش لوجين
  if (!authLoading && !user && fromSalla && uidFromQuery) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h1 className="text-2xl font-bold mb-2">🎉 تم ربط متجرك بسلة</h1>
          <p className="text-gray-600 mb-4">
            تم ربط <b>{storeName || 'متجرك'}</b> بنجاح. يمكنك الآن إكمال إعداد الحساب للوصول إلى لوحة التحكم.
          </p>

          <div className="mb-4">
            <div className="text-sm text-gray-500">Store UID</div>
            <div className="font-mono text-xs bg-gray-50 border rounded p-2">{uidFromQuery}</div>
          </div>

          <div className="flex gap-3">
            {onboardingToken ? (
              <a
                href={`/onboarding/set-password?t=${encodeURIComponent(onboardingToken)}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                إكمال إنشاء الحساب
              </a>
            ) : (
              <a
                href="/onboarding/set-password"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                إنشاء حساب والدخول
              </a>
            )}

            <a
              href={`/dashboard?salla=connected&uid=${encodeURIComponent(uidFromQuery)}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200"
            >
              تحديث الصفحة
            </a>
          </div>

          <hr className="my-6" />

          <div className="text-sm text-gray-600">
            يمكن الرجوع إلى هذه الصفحة لاحقًا من سوق سلة أيضًا. ولعرض الودجت داخل المتجر، انسخ الكود من قسم الإعدادات بعد إنشاء الحساب.
          </div>
        </div>
      </div>
    );
  }

  // لو لسه بنتحقق من اللوجين
  if (authLoading) return <p>جارٍ التحقق من حالة تسجيل الدخول…</p>;

  // لو مش داخل ومش جاي من سلة → اطلب تسجيل الدخول
  if (!user) return <p className="text-red-600">مطلوب تسجيل الدخول للوصول للوحة التحكم.</p>;

  // وضع الداشبورد المعتاد
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
        {activeTab === 'الإعدادات' && <SettingsTab storeUid={storeUid} />}
        {activeTab === 'المساعدة' && <SupportTab />}
      </div>
    </div>
  );
}
