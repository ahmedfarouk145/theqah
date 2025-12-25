// src/pages/connect/salla.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { motion } from 'framer-motion';
import { CheckCircle, ExternalLink, ShoppingBag, ArrowRight, Info } from 'lucide-react';

// رابط تطبيق مشتري موثق في متجر سلة
const SALLA_APP_STORE_URL = process.env.NEXT_PUBLIC_SALLA_APP_URL || 'https://apps.salla.sa/ar/app/1180703836';


export default function ConnectSalla() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsLoggedIn(!!user);
      setUserEmail(user?.email || '');
    });
    return () => unsubscribe();
  }, []);

  const handleConnectClick = () => {
    // فتح متجر سلة في تاب جديد
    window.open(SALLA_APP_STORE_URL, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-lg w-full bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-2xl p-8 shadow-2xl"
        dir="rtl"
      >
        {/* Header */}
        <div className="text-center space-y-4 mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xl"
          >
            <ShoppingBag className="w-10 h-10 text-white" />
          </motion.div>

          <h1 className="text-2xl font-extrabold text-gray-900">ربط متجر سلة</h1>
          <p className="text-gray-600 leading-relaxed">
            اربط متجرك في سلة مع مشتري موثق لتوثيق تقييمات عملائك تلقائياً
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
            <span className="w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">1</span>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">اذهب لمتجر تطبيقات سلة</h3>
              <p className="text-sm text-gray-600">اضغط الزر أدناه لفتح صفحة التطبيق في سلة</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <span className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">2</span>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">ثبّت التطبيق</h3>
              <p className="text-sm text-gray-600">اضغط &quot;تثبيت&quot; ووافق على الصلاحيات المطلوبة</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
            <span className="w-7 h-7 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">3</span>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">يتم الربط تلقائياً</h3>
              <p className="text-sm text-gray-600">سيتم ربط متجرك تلقائياً بحسابك هنا</p>
            </div>
          </div>
        </div>

        {/* Login Check */}
        {isLoggedIn === false && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6"
          >
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-700">
                <p className="font-medium mb-1">يجب تسجيل الدخول أولاً</p>
                <p>سجّل دخولك لربط متجرك بحسابك</p>
                <Link href="/login" className="inline-flex items-center gap-1 mt-2 text-amber-800 font-bold hover:underline">
                  تسجيل الدخول <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        {isLoggedIn && userEmail && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-sm text-green-700">
                مسجّل دخول كـ: <strong>{userEmail}</strong>
              </span>
            </div>
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={handleConnectClick}
          disabled={isLoggedIn === false}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <span>فتح متجر سلة لتثبيت التطبيق</span>
          <ExternalLink className="w-5 h-5" />
        </button>

        {/* Help */}
        <div className="mt-6 text-center">
          <Link
            href="/support"
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            تحتاج مساعدة؟ تواصل مع الدعم
          </Link>
        </div>

        {/* Back */}
        <div className="mt-4 text-center">
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 transition"
          >
            <ArrowRight className="w-4 h-4 transform rotate-180" />
            العودة لاختيار المنصة
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
