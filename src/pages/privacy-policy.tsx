// src/pages/privacy-policy.tsx
'use client';

import NavbarLanding from '@/components/NavbarLanding';
import { motion, useScroll, useTransform } from 'framer-motion';
import Image from 'next/image';

export default function PrivacyPolicyPage() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 300], [0, -50]);

  return (
    <main className="bg-white text-[#0e1e1a] font-sans overflow-x-hidden">
      <NavbarLanding />
      <div className="h-20" />

      {/* Hero Section with parallax logo */}
      <section className="relative flex flex-col items-center pt-12 pb-20 bg-gradient-to-b from-green-50 to-white">
        <motion.div style={{ y }} className="pointer-events-none">
          <Image src="/logo.png" alt="مشتري موثّق" width={120} height={120} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mt-4 text-4xl font-extrabold text-green-900"
        >
          سياسة الخصوصية
        </motion.h1>
      </section>

      {/* Content Sections */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-16">
        {[
          {
            title: '١. جمع المعلومات',
            content:
              'نقوم بجمع المعلومات الضرورية فقط، مثل البريد الإلكتروني وبيانات المتجر، بهدف تحسين جودة الخدمة وتخصيص تجربة المستخدم.',
          },
          {
            title: '٢. استخدام البيانات',
            content:
              'نستخدم بياناتك لإرسال رسائل التقييم وتحليل الآراء لتحسين خدمات المتاجر، دون بيع أو تأجير بياناتك لأي جهة خارجية.',
          },
          {
            title: '٣. مشاركة المعلومات',
            content:
              'لا تتم مشاركة بياناتك مع أي طرف ثالث، إلا في حال وجود التزام قانوني أو بأمر من جهة مختصة داخل المملكة العربية السعودية.',
          },
          {
            title: '٤. موافقتك',
            content:
              'باستخدامك لمنصة مشتري موثّق، فإنك تقر بموافقتك على جمع واستخدام معلوماتك كما هو موضح في هذه السياسة.',
          },
        ].map((section, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.3, duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl font-semibold text-green-800 mb-2">{section.title}</h2>
            <p className="text-gray-700 leading-relaxed">{section.content}</p>
          </motion.div>
        ))}

        {/* Footer info */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.8 }}
          className="text-gray-500 text-sm text-center"
        >
          تم تحديث هذه السياسة بتاريخ يوليو 2025. إذا كان لديك أي استفسار، نرجو التواصل معنا عبر صفحة الدعم.
        </motion.p>
      </div>

      <footer className="bg-green-100 py-6 text-center text-sm text-green-900 border-t border-green-200">
        <p>© 2025 مشتري موثّق - جميع الحقوق محفوظة</p>
      </footer>
    </main>
  );
}
