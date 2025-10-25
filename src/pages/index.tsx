// src/pages/index.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import NavbarLanding from '@/components/NavbarLanding';

export default function LandingPage() {
  const [storesCount, setStoresCount] = useState(300);
  const [reviewsCount, setReviewsCount] = useState(500);

  // جلب البيانات من Firebase
  const fetchCounts = async () => {
    try {
      const response = await fetch('/api/public/stats');
      if (response.ok) {
        const data = await response.json();
        setStoresCount((data.stores || 0) + 300); // يبدأ من 300 ويضيف الداتا الحقيقية
        setReviewsCount((data.reviews || 0) + 500); // يبدأ من 500 ويضيف الداتا الحقيقية
      }
    } catch (error) {
      console.log('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    // جلب البيانات عند تحميل الصفحة
    fetchCounts();
    
    // تحديث البيانات كل 15 دقيقة (900000 ms = 15 دقيقة)
    const interval = setInterval(fetchCounts, 900000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <NavbarLanding />
      <div className="h-20" />

      <main className="font-sans text-[#0e1e1a] bg-white overflow-x-hidden">
        {/* Hero Section */}
        <section className="min-h-[90vh] flex flex-col justify-center items-center text-center px-6 bg-gradient-to-b from-green-50 to-white relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-100 via-white to-transparent opacity-20 pointer-events-none"
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="z-10 max-w-2xl space-y-6"
          >
            <Image src="/logo.png" alt="مشتري موثّق" width={100} height={100} className="mx-auto" />
            <h1 className="text-4xl md:text-5xl font-extrabold text-green-900 leading-tight">
              مشتري موثّق  تقييمات حقيقية بعد الشراء
            </h1>
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
           اجمع تقييمات عملائك تلقائيًا بعد الشراء، واعرضها مباشرة أسفل المنتج كتقييمات موثوقة
           <br />
           <span className="text-green-600 font-semibold text-lg">
             أكثر من {storesCount.toLocaleString()} متجر يثق بنا و {reviewsCount.toLocaleString()} تقييم موثّق
           </span>
            </p>
            <Link href="/signup">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                className="bg-green-700 text-white px-10 py-3 rounded-full text-lg shadow-md hover:bg-green-800 transition"
              >
                ابدأ الآن مجاناً
              </motion.button>
            </Link>
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6 bg-[#f9f9f9]">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-14 text-green-800">لماذا تختار مشتري موثّق؟</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {[
                { icon: '💬', title: 'إرسال تلقائي للرسائل', desc: 'SMS / واتساب / بريد إلكتروني بعد كل عملية شراء' },
                { icon: '🧠', title: 'ذكاء اصطناعي فلتر', desc: 'منع التقييمات المسيئة تلقائيًا وبذكاء' },
                { icon: '🌟', title: ' عرض التقييمات الموثوقة ', desc: 'اعرض جميع التقييمات بعلامة “مشتري موثّق” لتُظهر المراجعات الحقيقية من المشترين الفعليين' },
              ].map((feat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.3, duration: 0.8 }}
                  viewport={{ once: true }}
                  className="bg-white rounded-xl p-6 shadow hover:shadow-xl transition"
                >
                  <div className="text-4xl mb-4 bg-green-100 text-green-800 w-14 h-14 rounded-full mx-auto flex items-center justify-center">
                    {feat.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-green-900">{feat.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feat.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Steps Section */}
        <section className="py-20 px-6 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-12 text-green-800">كيف يعمل مشتري موثّق؟</h2>
            <div className="space-y-8 text-right">
              {[
                'اربط متجرك مع مشتري موثّق (سلة / زد / Webhook)',
                'نرسل رابط التقييم تلقائيًا بعد الشراء',
                'العميل يقيّم المنتج أو الخدمة بسهولة',
               ' نعرض التقييمات الموثقة تحت المنتج و في صفحة عامة',
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.2, duration: 0.6 }}
                  viewport={{ once: true }}
                  className="bg-green-50 rounded-xl p-5 text-lg text-green-900 shadow-sm"
                >
                  <span className="font-bold text-green-600 ml-2">{i + 1}.</span> {step}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 px-6 bg-gradient-to-b from-green-50 to-green-100">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="text-3xl font-bold mb-8 text-green-800"
            >
              الثقة في الأرقام
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="text-5xl font-bold text-green-600 mb-2">
                  {storesCount.toLocaleString()}+
                </div>
                <div className="text-xl text-green-800 font-medium">
                  متجر يثق بنا
                </div>
                <p className="text-green-600 mt-2">
                  متاجر من جميع أنحاء المملكة
                </p>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="text-5xl font-bold text-green-600 mb-2">
                  {reviewsCount.toLocaleString()}+
                </div>
                <div className="text-xl text-green-800 font-medium">
                  تقييم موثّق
                </div>
                <p className="text-green-600 mt-2">
                  تقييمات حقيقية من مشترين فعليين
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-green-100 py-6 text-center text-sm text-green-900 border-t border-green-200">
          <div className="flex justify-center gap-6 mb-2 flex-wrap">
            <Link href="/privacy-policy" className="hover:underline">سياسة الخصوصية</Link>
            <Link href="/terms" className="hover:underline">الشروط والأحكام</Link>
            <Link href="/support" className="hover:underline">الدعم والمساعدة</Link>
          </div>
          <p>© 2025 مشتري موثّق - جميع الحقوق محفوظة</p>
        </footer>
      </main>
    </>
  );
}
