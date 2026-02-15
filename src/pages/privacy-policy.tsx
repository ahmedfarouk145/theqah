// src/pages/privacy-policy.tsx
'use client';

import NavbarLanding from '@/components/NavbarLanding';
import Image from 'next/image';

export default function PrivacyPolicyPage() {
  const sections = [
    {
      title: '١. جمع المعلومات',
      content:
        'لتقديم خدمة التوثيق التلقائي، نقوم بجمع ومعالجة المعلومات الضرورية فقط، وتشمل:\n• بيانات المتجر: (مثل الاسم، الرابط، والبريد الإلكتروني للتواصل).\n• بيانات الطلبات والتقييمات: نصل إلى بيانات "حالة الطلب" و"حالة الدفع" و"نص التقييم" فقط لغرض المطابقة والتحقق.\n• تنويه هام: نحن لا نقوم بجمع أو تخزين بيانات البطاقات الائتمانية أو الأرقام السرية الخاصة بعملائك نهائياً.',
    },
    {
      title: '٢. استخدام البيانات (آلية العمل)',
      content:
        '• التحقق والمطابقة: مقارنة بيانات التقييم مع سجلات الدفع والتنفيذ في متجرك للتأكد من أن المقيّم هو مشترٍ حقيقي.\n• إظهار شارة التوثيق: حقن كود "مشتري موثق" لإظهار الشارة على التقييمات الصحيحة.\n• تحسين محركات البحث (SEO): تهيئة بيانات التقييمات لتظهر في نتائج البحث (Rich Snippets).',
    },
    {
      title: '٣. سياسة الاستخدام العادل (Fair Use Policy)',
      content:
        'لضمان استمرارية الخدمة بجودة عالية لجميع المشتركين، يخضع الاشتراك للشروط التالية:\n• ترخيص الاستخدام: الاشتراك الواحد مخصص لمتجر إلكتروني واحد فقط (نطاق/Domain واحد). يمنع استخدام نفس الاشتراك لعدة متاجر.\n• التلاعب بالبيانات: يحظر محاولة التلاعب ببيانات الطلبات أو إنشاء طلبات وهمية بهدف الحصول على شارة التوثيق بطرق غير شرعية.\n• استقرار الخدمة: في حال استهلاك المتجر لموارد الخادم بشكل غير طبيعي، يحق للمنصة تعليق الخدمة مؤقتاً لضمان سلامة النظام.',
    },
    {
      title: '٤. مشاركة المعلومات',
      content:
        'نلتزم بالحفاظ على سرية بياناتك وبيانات عملائك. لا نقوم ببيع أو تأجير أو مشاركة البيانات مع أي طرف ثالث، باستثناء:\n• البيانات العامة (نص التقييم والنجوم) التي تظهر للزوار في واجهة المتجر.\n• الامتثال لأي التزام قانوني أو أمر صادر من جهة مختصة داخل المملكة العربية السعودية.',
    },
    {
      title: '٥. العلامة التجارية والملكية الفكرية',
      content:
        'منصة "مشتري موثق" مسجلة رسمياً ومحمية بموجب أنظمة الهيئة السعودية للملكية الفكرية. جميع الحقوق المتعلقة بالاسم، الشعار، الأكواد البرمجية، محفوظة للمنصة.\nيُمنح المتجر المشترك ترخيصاً مؤقتاً لاستخدام "شارة التوثيق" و"الشهادة" خلال فترة سريان اشتراكه فقط، ويلتزم بإزالتها فور انتهاء أو إلغاء الاشتراك.',
    },
    {
      title: '٦. موافقتك',
      content:
        'بتثبيت واستخدام تطبيق "مشتري موثق"، فإنك تقر بموافقتك الكاملة على جمع واستخدام المعلومات وفقاً لهذه السياسة.',
    },
  ];

  return (
    <main className="bg-white text-[#0e1e1a] font-sans overflow-x-hidden">
      <NavbarLanding />
      <div className="h-20" />

      {/* Hero Section - CSS animation instead of framer-motion */}
      <section className="relative flex flex-col items-center pt-12 pb-20 bg-gradient-to-b from-green-50 to-white">
        <div className="animate-fade-in">
          <Image src="/logo.png" alt="مشتري موثّق" width={120} height={120} priority />
        </div>
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-green-900 animate-slide-up text-center px-4">
          سياسة الخصوصية والاستخدام
        </h1>
      </section>

      {/* Content Sections */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-16">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className="animate-slide-up"
            style={{ animationDelay: `${idx * 0.1}s` }}
          >
            <h2 className="text-2xl font-semibold text-green-800 mb-2">{section.title}</h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">{section.content}</p>
          </div>
        ))}

        {/* Footer info */}
        <p className="text-gray-500 text-sm text-center animate-fade-in" style={{ animationDelay: '0.5s' }}>
          تم تحديث هذه السياسة بتاريخ: يناير 2026. لأي استفسارات، يسعدنا تواصلكم عبر قنوات الدعم الرسمية
        </p>
      </div>

      <footer className="bg-green-100 py-6 text-center text-sm text-green-900 border-t border-green-200">
        <p>© 2026 مشتري موثّق - جميع الحقوق محفوظة</p>
        <a href="https://drive.google.com/file/d/1HTVS6PJeV5p9jOHFWq_8Kc_VC-gpQZVg/view?usp=drivesdk" target="_blank" rel="noopener noreferrer" className="mt-1 block hover:underline">النظام مسجّل ومحمي قانونيًا لدى الهيئة السعودية للملكية الفكرية</a>
      </footer>
    </main>
  );
}
