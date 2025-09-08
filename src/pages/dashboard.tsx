'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
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

export default function DashboardPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dash_active_tab') as Tab) || 'الإحصائيات';
    }
    return 'الإحصائيات';
  });

  const [authLoading, setAuthLoading] = useState(true);
  const [userPresent, setUserPresent] = useState(false);

  const [storeName, setStoreName] = useState<string | undefined>(undefined);
  const [storeUid, setStoreUid] = useState<string | undefined>(undefined);
  const [storeLoading, setStoreLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem('dash_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const auth = getAuth(app);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserPresent(!!u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // جلب اسم المتجر و storeUid بشكل قياسي
  useEffect(() => {
    const run = async () => {
      setStoreLoading(true);
      try {
        const auth = getAuth(app);
        const user = auth.currentUser;
        if (!user) {
          setStoreName(undefined);
          setStoreUid(undefined);
          return;
        }
        const idToken = await user.getIdToken(true);

        // أولوية uid من الكويري (لو جاي من set-password)
        const uidFromQuery =
          typeof router.query.uid === 'string' ? router.query.uid : undefined;
        if (uidFromQuery) setStoreUid(uidFromQuery);

        // اندبوينت موحّد بيرجع storeUid + الاسم
        const res = await axios.get('/api/store/info', {
          headers: { Authorization: `Bearer ${idToken}` },
        }).catch(() => null);

        const name =
          res?.data?.store?.name ??
          res?.data?.name ??
          res?.data?.storeName ??
          undefined;

        // حاول استخراج storeUid (لو مش موجود في الكويري)
        const storeUidFromInfo: string | undefined =
          res?.data?.store?.storeUid ??
          (res?.data?.store?.salla?.storeId
            ? `salla:${String(res.data.store.salla.storeId)}`
            : undefined);

        if (!uidFromQuery && storeUidFromInfo) setStoreUid(storeUidFromInfo);
        if (name) setStoreName(name);

        // كملّة تأكيد: لو لسه مفيش اسم، استخرجه من حالة سلة (بس بالـ uid لو معانا)
        if (!name && (uidFromQuery || storeUidFromInfo)) {
          const st = await axios.get(
            `/api/salla/status?uid=${encodeURIComponent(
              uidFromQuery || storeUidFromInfo!
            )}`,
            { headers: { Authorization: `Bearer ${idToken}` } }
          ).catch(() => null);

          const sName =
            st?.data?.storeName ??
            st?.data?.salla?.storeName ??
            undefined;
          if (sName) setStoreName(sName);
        }
      } finally {
        setStoreLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.uid]);

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

  if (authLoading) return <p>جارٍ التحقق من حالة تسجيل الدخول…</p>;
  if (!userPresent) return <p className="text-red-600">مطلوب تسجيل الدخول للوصول للوحة التحكم.</p>;

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
