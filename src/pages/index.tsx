// src/pages/index.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import NavbarLanding from '@/components/NavbarLanding';

// Lazy load non-critical components
const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), {
  ssr: false,
  loading: () => null,
});

export default function LandingPage() {
  const [storesCount, setStoresCount] = useState(300);
  const [reviewsCount, setReviewsCount] = useState(5000);

  // جلب البيانات من Firebase
  const fetchCounts = async () => {
    try {
      const response = await fetch('/api/public/stats');
      if (response.ok) {
        const data = await response.json();
        setStoresCount((data.stores || 0) + 300);
        setReviewsCount((data.reviews || 0) + 5000);
      }
    } catch (error) {
      console.log('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 900000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <NavbarLanding />
      <div className="h-20" aria-hidden="true" />

      <main id="main-content" className="font-sans text-[#0e1e1a] bg-white overflow-x-hidden" role="main">
        {/* Hero Section - CSS animations instead of framer-motion */}
        <section
          className="min-h-[90vh] flex flex-col justify-center items-center text-center px-6 bg-gradient-to-b from-green-50 to-white relative overflow-hidden"
          aria-label="قسم البطل - مقدمة عن مشتري موثّق"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-100 via-white to-transparent opacity-20 pointer-events-none animate-fade-in" />
          <div className="z-10 max-w-2xl space-y-6 animate-slide-up">
            <Image
              src="/logo.png"
              alt="شعار مشتري موثّق - منصة تقييمات العملاء الموثوقة"
              width={100}
              height={100}
              className="mx-auto"
              priority
            />
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
              <button
                className="bg-green-700 text-white px-10 py-3 rounded-full text-lg shadow-md hover:bg-green-800 hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-green-300"
                aria-label="ابدأ الاشتراك المجاني في مشتري موثّق"
              >
                ابدأ الآن مجاناً
              </button>
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6 bg-[#f9f9f9]">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-14 text-green-800">لماذا تختار مشتري موثّق؟</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {[
                { icon: '💬', title: 'إرسال تلقائي للرسائل', desc: 'SMS / واتساب / بريد إلكتروني بعد كل عملية شراء' },
                { icon: '🧠', title: 'ذكاء اصطناعي فلتر', desc: 'منع التقييمات المسيئة تلقائيًا وبذكاء' },
                { icon: '🌟', title: ' عرض التقييمات الموثوقة ', desc: 'اعرض جميع التقييمات بعلامة "مشتري موثّق" لتُظهر المراجعات الحقيقية من المشترين الفعليين' },
              ].map((feat, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl p-6 shadow hover:shadow-xl transition-all duration-300"
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className="text-4xl mb-4 bg-green-100 text-green-800 w-14 h-14 rounded-full mx-auto flex items-center justify-center">
                    {feat.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-green-900">{feat.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feat.desc}</p>
                </div>
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
                ' نعرض التقييمات الموثقة تحت المنتج و في صفحة عامة',
              ].map((step, i) => (
                <div
                  key={i}
                  className="bg-green-50 rounded-xl p-5 text-lg text-green-900 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <span className="font-bold text-green-600 ml-2">{i + 1}.</span> {step}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 px-6 bg-gradient-to-b from-green-50 to-green-100">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-8 text-green-800">
              الثقة في الأرقام
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="text-center">
                <div className="text-5xl font-bold text-green-600 mb-2">
                  {storesCount.toLocaleString()}+
                </div>
                <div className="text-xl text-green-800 font-medium">
                  متجر يثق بنا
                </div>
                <p className="text-green-600 mt-2">
                  متاجر من جميع أنحاء المملكة
                </p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold text-green-600 mb-2">
                  {reviewsCount.toLocaleString()}+
                </div>
                <div className="text-xl text-green-800 font-medium">
                  تقييم موثّق
                </div>
                <p className="text-green-600 mt-2">
                  تقييمات حقيقية من مشترين فعليين
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-green-100 py-6 text-sm text-green-900 border-t border-green-200" role="contentinfo" aria-label="معلومات التذييل">
          <div className="max-w-6xl mx-auto px-4 flex flex-col gap-3">
            <nav className="flex justify-center gap-6 flex-wrap" role="navigation" aria-label="روابط التذييل">
              <Link href="/privacy-policy" className="hover:underline">
                سياسة الخصوصية
              </Link>
              <Link href="/terms" className="hover:underline">
                الشروط والأحكام
              </Link>
              <Link href="/support" className="hover:underline">
                الدعم والمساعدة
              </Link>
            </nav>
            <p className="text-center md:text-right">
              ©️ مُشتري موثّق. جميع الحقوق محفوظة.
              <br />
              النظام مسجّل ومحمي قانونيًا لدى الهيئة السعودية للملكية الفكرية
            </p>
            <div className="w-full flex justify-end gap-4">
              <a
                href="https://www.qudwa.org.sa"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center"
              >
                <Image
                  src="/qudwa-logo.png"
                  alt="شعار جمعية قدوة لرعاية الأيتام - شريك مشتري موثّق"
                  width={80}
                  height={80}
                  className="opacity-90 hover:opacity-100 transition"
                  loading="lazy"
                />
              </a>
              <a
                href="https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000203970"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center"
              >
                <Image
                  src="/eauth-logo.png"
                  alt="شعار التحقق الإلكتروني - شهادة مُشتري موثّق معتمدة"
                  width={40}
                  height={40}
                  className="opacity-90 hover:opacity-100 transition"
                  style={{ width: 'auto', height: 40 }}
                  loading="lazy"
                />
              </a>
            </div>
          </div>
        </footer>
      </main>

      <FeedbackWidget />
    </>
  );
}
