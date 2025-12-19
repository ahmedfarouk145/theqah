'use client';

import Head from 'next/head';
import Image from 'next/image';
import NavbarLanding from '@/components/NavbarLanding';

export default function TermsPage() {
  const sections = [
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
  ];

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

        {/* Hero Section - CSS animation instead of framer-motion */}
        <section className="flex flex-col items-center justify-center text-center py-16 bg-gradient-to-b from-green-50 to-white">
          <div className="animate-fade-in">
            <Image src="/logo.png" alt="شعار مشتري موثق" width={110} height={110} priority />
          </div>
          <h1 className="mt-4 text-4xl font-extrabold text-green-900 animate-slide-up">
            الشروط والأحكام
          </h1>
        </section>

        {/* Content Section */}
        <section className="max-w-3xl mx-auto px-6 py-16 space-y-12">
          {sections.map((item, idx) => (
            <div
              key={idx}
              className="bg-green-50 p-6 rounded-xl shadow-sm animate-slide-up"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <h2 className="text-2xl font-bold text-green-800 mb-2">{item.title}</h2>
              <p className="text-gray-700 leading-relaxed">{item.text}</p>
            </div>
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
