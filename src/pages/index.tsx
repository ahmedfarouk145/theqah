'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import NavbarLanding from '@/components/NavbarLanding';

export default function LandingPage() {
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
            <Image src="/logo.png" alt="ثقة" width={100} height={100} className="mx-auto" />
            <h1 className="text-4xl md:text-5xl font-extrabold text-green-900 leading-tight">
              ثقة - تقييم سعودي بثقة
            </h1>
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
              اجمع تقييمات العملاء تلقائياً بعد الشراء وانشرها على صفحة عامة موثوقة.
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
            <h2 className="text-3xl font-bold mb-14 text-green-800">لماذا تختار ثقة؟</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {[
                { icon: '💬', title: 'إرسال تلقائي للرسائل', desc: 'SMS / واتساب / بريد إلكتروني بعد كل عملية شراء' },
                { icon: '🧠', title: 'ذكاء اصطناعي فلتر', desc: 'منع التقييمات المسيئة تلقائيًا وبذكاء' },
                { icon: '🌟', title: 'صفحة عامة للتقييمات', desc: 'عرض التقييمات بثقة مع وسم "مشتري ثقة"' },
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
            <h2 className="text-3xl font-bold mb-12 text-green-800">كيف يعمل ثقة؟</h2>
            <div className="space-y-8 text-right">
              {[
                'اربط متجرك مع ثقة (سلة / زد / Webhook)',
                'نرسل رابط التقييم تلقائيًا بعد الشراء',
                'العميل يقيّم المنتج أو الخدمة بسهولة',
                'نعرض التقييمات الموثوقة في صفحة عامة',
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

        {/* Footer */}
        <footer className="bg-green-100 py-6 text-center text-sm text-green-900 border-t border-green-200">
          <div className="flex justify-center gap-6 mb-2 flex-wrap">
            <Link href="/privacy-policy" className="hover:underline">سياسة الخصوصية</Link>
            <Link href="/terms" className="hover:underline">الشروط والأحكام</Link>
            <Link href="/support" className="hover:underline">الدعم والمساعدة</Link>
          </div>
          <p>© 2025 ثقة - جميع الحقوق محفوظة</p>
        </footer>
      </main>
    </>
  );
}
