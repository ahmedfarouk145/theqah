// src/pages/connect/salla.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';

export default function ConnectSalla() {
  const router = useRouter();
  const [error, setError] = useState<string>('');
  const [starting, setStarting] = useState<boolean>(true);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    const start = async () => {
      try {
        setStarting(true);
        setError('');

        const auth = getAuth(app);
        const user = auth.currentUser;

        if (!user) {
          throw new Error('غير مصرح: الرجاء تسجيل الدخول أولاً.');
        }

        // خُد توكن حديث
        const idToken = await user.getIdToken(true);

        const params = new URLSearchParams();
        // مسار الرجوع بعد إنهاء التدفق في الكولباك
        params.set('return', '/admin');

        // استخدم رابط مطلق لو لزم الأمر
        const url =
          typeof window !== 'undefined'
            ? new URL(`/api/salla/connect?${params.toString()}`, window.location.origin).toString()
            : `/api/salla/connect?${params.toString()}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok) {
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          const j = await res.json().catch(() => ({} as any));
          throw new Error(j?.message || `HTTP ${res.status}`);
        }

        const j = (await res.json()) as { url?: string };
        if (!j?.url) throw new Error('Missing authorize URL');

        // التحويل إلى صفحة موافقة سلة
        window.location.assign(j.url);
      } catch (e) {
        if (cancelledRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStarting(false);
      }
    };

    // ابدأ فوراً (بدون الاعتماد على useAuth)
    start();
  }, []);

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
      <div className="bg-white rounded-3xl border border-gray-200/60 p-10 shadow-2xl w-full max-w-lg text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white text-3xl">
          {starting && !error ? '⏳' : error ? '⚠️' : '✅'}
        </div>

        {starting && !error && (
          <>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">بدء ربط سلة</h1>
            <p className="text-gray-600">جارٍ تحويلك إلى صفحة التفويض في سلة لإتمام الربط الآمن…</p>
          </>
        )}

        {error && (
          <>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-3">تعذّر بدء الربط</h1>
            <p className="text-rose-600 font-semibold mb-6">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => router.reload()}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold shadow-lg hover:shadow-xl"
              >
                إعادة المحاولة
              </button>

              <Link
                href="/connect"
                className="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50"
              >
                العودة
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
