// src/pages/connect/salla.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, CheckCircle, ArrowRight, ShoppingBag } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-md w-full bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-2xl p-8 shadow-2xl"
        dir="rtl"
      >
        {starting && !error && (
          <div className="text-center space-y-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xl"
            >
              <ShoppingBag className="w-10 h-10 text-white" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="space-y-3"
            >
              <h1 className="text-2xl font-extrabold text-gray-900">بدء ربط منصة سلة</h1>
              <p className="text-gray-600 leading-relaxed">
                جارٍ تحويلك إلى صفحة التفويض في سلة لإتمام الربط الآمن…
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center justify-center gap-3"
            >
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
              <span className="text-green-600 font-medium">جارٍ الاتصال بسلة...</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-blue-50 border border-blue-200 rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">نصيحة:</p>
                  <p>تأكد من تسجيل الدخول في حساب سلة الخاص بك في نفس المتصفح</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center mx-auto shadow-xl">
              <AlertCircle className="w-10 h-10 text-white" />
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl font-extrabold text-gray-900">تعذّر بدء الربط</h1>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-rose-700 font-medium text-sm">{error}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => router.reload()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
              >
                <ArrowRight className="w-4 h-4 transform rotate-180" />
                إعادة المحاولة
              </button>

              <Link
                href="/connect"
                className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium shadow hover:shadow-md hover:bg-gray-200 transition-all duration-200"
              >
                العودة للربط
              </Link>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-700">
                  <p className="font-medium mb-1">إذا استمرت المشكلة:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• تأكد من اتصالك بالإنترنت</li>
                    <li>• جرب مسح ذاكرة التخزين المؤقت للمتصفح</li>
                    <li>• تواصل مع الدعم الفني</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
