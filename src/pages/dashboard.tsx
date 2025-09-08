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

type ApiStoreInfoStore = {
  name?: string;
  storeUid?: string;
  salla?: {
    storeId?: string | number;
    apiBase?: string;
    domain?: string;
    storeName?: string;
  };
};

type ApiStoreInfo = {
  store?: ApiStoreInfoStore;
  name?: string;
  storeName?: string;
} | null;

type SallaStatus = {
  ok?: boolean;
  connected?: boolean;
  uid?: string;
  storeName?: string | null;
  salla?: { storeName?: string };
  domain?: string | null;
  reason?: string;
} | null;

function getSS(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSS(key: string, val: string | null | undefined) {
  try {
    if (typeof window === 'undefined') return;
    if (val == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, val); // هنا val أكيد string
  } catch {
    /* ignore */
  }
}

async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T | null }> {
  const r = await fetch(url, init);

  let j: unknown = null;
  try {
    j = await r.json();
  } catch {
    j = null;
  }

  // بعض الـ APIs بتلفّ الرد داخل { data: ... }
  let data: T | null = null;
  if (j && typeof j === 'object') {
    const obj = j as Record<string, unknown>;
    if ('data' in obj) {
      data = obj.data as T;
    } else {
      data = j as T;
    }
  }

  return { ok: r.ok, data };
}

export default function DashboardPage() {
  const router = useRouter();

  // 1) التبويب النشط (persist)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dash_active_tab') as Tab) || 'الإحصائيات';
    }
    return 'الإحصائيات';
  });
  useEffect(() => {
    localStorage.setItem('dash_active_tab', activeTab);
  }, [activeTab]);

  // 2) حالة المصادقة
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

  // 3) اسم المتجر و uid (مع حفظ مؤقت لتقليل فلاش)
  const [storeName, setStoreName] = useState<string | undefined>(() => getSS('store_name') || undefined);
  const [storeUid, setStoreUid] = useState<string | undefined>(() => getSS('store_uid') || undefined);
  const [storeLoading, setStoreLoading] = useState(true);

  // helper: يجيب idToken
  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      const token = await user.getIdToken(true);
      return token;
    } catch {
      return null;
    }
  }, [user]);

  // core loader: تحديد uid ثم جلب الاسم
  const loadStore = useCallback(
    async (hintUid?: string | null) => {
      setStoreLoading(true);
      try {
        // 0) uid من الكويري له أولوية
        const uidFromQuery = typeof router.query.uid === 'string' ? router.query.uid : undefined;
        let preferredUid: string | undefined = hintUid || uidFromQuery;

        // 1) لو مفيش uid، حاول من /api/store/info
        if (!preferredUid && user) {
          const token = await getIdToken();
          if (token) {
            const { data: info } = await fetchJson<ApiStoreInfo>('/api/store/info', {
              headers: { Authorization: `Bearer ${token}` },
            });

            const s = info?.store;

            const inferred =
              s?.storeUid || (s?.salla?.storeId != null ? `salla:${String(s.salla.storeId)}` : undefined);
            if (inferred) preferredUid = inferred;

            // اسم مبدئي لو ظهر
            const preliminaryName =
              s?.name || s?.salla?.storeName || info?.name || info?.storeName || undefined;
            if (preliminaryName && !storeName) setStoreName(preliminaryName);
          }
        }

        // 2) لو لسه مفيش uid، جرّب /api/salla/status (قد يرجّع uid)
        if (!preferredUid && user) {
          const token = await getIdToken();
          if (token) {
            const { data: st } = await fetchJson<SallaStatus>('/api/salla/status', {
              headers: { Authorization: `Bearer ${token}` },
            });

            const returnedUid = st?.uid;
            if (returnedUid) preferredUid = returnedUid;

            const maybeName = st?.storeName ?? st?.salla?.storeName ?? undefined;
            if (maybeName && !storeName) setStoreName(maybeName);
          }
        }

        // 3) عند توفر uid: اقرأ الحالة من مصدر الحقيقة
        if (preferredUid) {
          const { data: status } = await fetchJson<SallaStatus>(
            `/api/salla/status?uid=${encodeURIComponent(preferredUid)}`
          );

          const sName = status?.storeName ?? status?.salla?.storeName ?? undefined;

          setStoreUid(preferredUid);
          setSS('store_uid', preferredUid);

          if (typeof sName === 'string' && sName.trim()) {
            setStoreName(sName.trim());
            setSS('store_name', sName.trim());
          }
        } else {
          // ما قدرناش نحدد uid — نظّف التخزين المؤقت
          setStoreUid(undefined);
          setSS('store_uid', null);
        }
      } finally {
        setStoreLoading(false);
      }
    },
    [router.query.uid, user, getIdToken, storeName]
  );

  // شغّل اللودر عندما تكون المصادقة جاهزة
  useEffect(() => {
    const fromSalla = typeof router.query.salla === 'string' && router.query.salla === 'connected';
    if (!authLoading) {
      if (fromSalla) {
        const t = setTimeout(() => {
          void loadStore(storeUid);
        }, 400);
        return () => clearTimeout(t);
      }
      void loadStore(storeUid);
    }
  }, [authLoading, router.query.salla, storeUid, loadStore]);

  // رندر الشارة اليمين
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
  if (!user) return <p className="text-red-600">مطلوب تسجيل الدخول للوصول للوحة التحكم.</p>;

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

        {/* مهم: مرّر storeUid لتبويب الإعدادات */}
        {activeTab === 'الإعدادات' && <SettingsTab storeUid={storeUid} />}

        {activeTab === 'المساعدة' && <SupportTab />}
      </div>
    </div>
  );
}
