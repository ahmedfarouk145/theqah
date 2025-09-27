'use client';

import Head from 'next/head';
import Image from 'next/image';
import NavbarLanding from '@/components/NavbarLanding';
import { motion } from 'framer-motion';

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>الشروط والأحكام - مشتري موثق</title>
        <meta
          name="description"
          content="تعرف على الشروط والأحكام لاستخدام منصة مشتري موثق لجمع التقييمات."
        />
      </Head>

      <main className="bg-white text-[#0e1e1a] font-sans overflow-x-hidden">
        <NavbarLanding />
        <div className="h-20" />

        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center text-center py-16 bg-gradient-to-b from-green-50 to-white">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
          >
            <Image src="/logo.png" alt="شعار مشتري موثق" width={110} height={110} />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mt-4 text-4xl font-extrabold text-green-900"
          >
            الشروط والأحكام
          </motion.h1>
        </section>

        {/* Content Section */}
        <section className="max-w-3xl mx-auto px-6 py-16 space-y-12">
          {[
            {
              title: '١. الموافقة على الشروط',
              text: 'باستخدامك لمنصة مشتري موثق، فإنك توافق على الالتزام بجميع الشروط والسياسات المعلنة.',
            },
            {
              title: '٢. الاستخدام القانوني',
              text: 'لا يجوز استخدام المنصة لأي غرض غير قانوني أو ينتهك القوانين المحلية أو الدولية.',
            },
            {
              title: '٣. التعديلات',
              text: 'تحتفظ منصة مشتري موثق بالحق في تعديل الشروط والأحكام في أي وقت، ويتم إعلامك بذلك عبر البريد الإلكتروني أو إشعار داخل المنصة.',
            },
            {
              title: '٤. الاستمرارية',
              text: 'استمرار استخدامك للمنصة بعد التعديلات يعني موافقتك الضمنية على الشروط المحدثة.',
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.2, duration: 0.6 }}
              viewport={{ once: true }}
              className="bg-green-50 p-6 rounded-xl shadow-sm"
            >
              <h2 className="text-2xl font-bold text-green-800 mb-2">{item.title}</h2>
              <p className="text-gray-700 leading-relaxed">{item.text}</p>
            </motion.div>
          ))}
        </section>

        {/* Footer */}
        <footer className="bg-green-100 py-6 text-center text-sm text-green-900 border-t border-green-200">
          <p>© 2025 مشتري موثق - جميع الحقوق محفوظة</p>
        </footer>
      </main>
    </>
  );
}
