// src/pages/faq.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import NavbarLanding from '@/components/NavbarLanding';

// FAQ data for cleaner code
const faqItems = [
  {
    q: 'ما هي خدمة مشتري موثّق؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        خدمة تضمن مصداقية التقييمات في المتاجر الإلكترونية. بعد الشراء، يُرسل رابط تقييم حصري للمشتري عبر
        <strong> SMS / واتساب / البريد الإلكتروني</strong> ويُستخدم مرة واحدة فقط. يمرّ التقييم بفلترة
        <strong> ذكاء اصطناعي</strong> قبل النشر ويظهر مع وسم <strong>&ldquo;مشتري موثّق&rdquo;</strong>.
      </p>
    ),
  },
  {
    q: 'كيف تعمل الخدمة خطوة بخطوة؟',
    a: (
      <ol className="list-decimal list-inside space-y-1 text-gray-700">
        <li>يكمل المشتري عملية الشراء في المتجر.</li>
        <li>يرسل النظام رابط تقييم شخصي تلقائيًا.</li>
        <li>يفتح المشتري الرابط ويضيف التقييم (نص + نجوم).</li>
        <li>تقوم خوارزميات الذكاء الاصطناعي بفلترة المحتوى.</li>
        <li>يتم التحقق آليًا من صحة المشتري.</li>
        <li>يُنشر التقييم في صفحة المتجر مع وسم &ldquo;مشتري موثّق&rdquo;.</li>
      </ol>
    ),
  },
  {
    q: 'هل الرابط يُستخدم أكثر من مرة؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        لا، كل رابط تقييم صالح <strong>لاستخدام واحد فقط</strong> لكل طلب. أي محاولة لإعادة الاستخدام يتم رفضها.
      </p>
    ),
  },
  {
    q: 'ماذا يحدث للتقييمات غير اللائقة؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        يتم كشف الكلمات المسيئة/غير المناسبة ورفض التقييم تلقائيًا، مع إمكانية إشعار المشتري لإعادة الإرسال
        بصيغة مناسبة.
      </p>
    ),
  },
  {
    q: 'ما قنوات إرسال روابط التقييم؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        ندعم <strong>SMS</strong> و<strong>واتساب</strong> و<strong>البريد الإلكتروني</strong> لضمان وصول الرابط
        عبر القناة المفضلة لدى المشتري.
      </p>
    ),
  },
  {
    q: 'متى يُنشر التقييم؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        إذا مرّ التقييم بالفلترة دون ملاحظات يُنشر <strong>فورًا</strong>. أما التقييمات المُعلّمة للمراجعة فقد
        تتأخر وفق إعدادات المتجر.
      </p>
    ),
  },
  {
    q: 'هل يدعم النظام لغات متعددة؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        نعم، يعمل نظام الفلترة الذكي مع لغات متعددة لضمان جودة المحتوى للمستخدمين محليًا ودوليًا.
      </p>
    ),
  },
  {
    q: 'كيف يستفيد صاحب المتجر؟',
    a: (
      <ul className="list-disc list-inside text-gray-700 space-y-1">
        <li>رفع الثقة وتقليل التقييمات المزيفة.</li>
        <li>تحسين معدلات التحويل والمبيعات.</li>
        <li>الحصول على تعليقات حقيقية لتحسين المنتجات والخدمة.</li>
      </ul>
    ),
  },
  {
    q: 'ماذا عن الحالات الخاصة؟',
    a: (
      <ul className="list-disc list-inside text-gray-700 space-y-1">
        <li>محاولة استخدام الرابط مرتين → يُرفض الاستخدام الثاني.</li>
        <li>تقييم دون محتوى نصّي كافٍ → يُرفض تلقائيًا.</li>
        <li>تقييم يحتوي كلمات محظورة → يُرفض ويُخطر المشتري.</li>
      </ul>
    ),
  },
  {
    q: 'كيف أبدأ؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        اربط متجرك مع مشتري موثّق (سُلّة/زِد/‎Webhook‎)، وفَعِّل قنوات الإرسال، واضبط إعدادات النشر. ابدأ الآن من
        <Link href="/signup" className="text-green-700 font-semibold hover:underline mr-1">
          صفحة التسجيل
        </Link>
        .
      </p>
    ),
  },
];

export default function FAQPage() {
  return (
    <>
      <NavbarLanding />
      <div className="h-20" />

      <main className="font-sans text-[#0e1e1a] bg-white overflow-x-hidden" dir="rtl">
        {/* Hero - CSS animation instead of framer-motion */}
        <section className="min-h-[60vh] flex flex-col justify-center items-center text-center px-6 bg-gradient-to-b from-green-50 to-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-100 via-white to-transparent opacity-20 pointer-events-none animate-fade-in" />
          <div className="z-10 max-w-3xl space-y-5 animate-slide-up">
            <Image src="/logo.png" alt="مشتري موثّق" width={84} height={84} className="mx-auto" priority />
            <h1 className="text-4xl md:text-5xl font-extrabold text-green-900 leading-tight">
              الأسئلة الشائعة — مشتري موثّق
            </h1>
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
              كل ما تحتاج معرفته عن خدمة <strong>مشتري موثّق</strong> لجعل تقييمات متجرك حقيقية وموثوقة.
            </p>
          </div>
        </section>

        {/* FAQ Cards - CSS animation instead of framer-motion */}
        <section className="py-20 px-6 bg-[#f9f9f9]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold mb-12 text-green-800 text-center">الأسئلة والإجابات</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {faqItems.map((faq, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl p-6 shadow hover:shadow-lg transition animate-slide-up"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <h3 className="text-xl font-semibold mb-2 text-green-900">{faq.q}</h3>
                  {faq.a}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 px-6 bg-white">
          <div className="max-w-3xl mx-auto text-center">
            <h3 className="text-2xl font-bold text-green-900 mb-3">جاهز تفعّل مشتري موثّق في متجرك؟</h3>
            <p className="text-gray-600 mb-6">
              ابدأ بجمع تقييمات حقيقية بعد الشراء وانشرها بعلامة &ldquo;مشتري موثّق&rdquo;.
            </p>
            <Link
              href="/signup"
              className="inline-block bg-green-700 text-white px-8 py-3 rounded-full text-md shadow-md hover:bg-green-800 hover:scale-105 transition-all duration-200"
            >
              ابدأ الآن مجانًا
            </Link>
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

        {/* SEO: FAQ Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: 'ما هي خدمة مشتري موثّق؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text:
                      'خدمة تضمن مصداقية التقييمات. بعد الشراء يُرسل رابط تقييم حصري للمشتري ويُستخدم مرة واحدة فقط، ويُفلتر التقييم بالذكاء الاصطناعي ويُعرض بوسم "مشتري موثّق".',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'كيف تعمل الخدمة خطوة بخطوة؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text:
                      'يكمل المشتري الشراء، يُرسل الرابط تلقائياً، يضيف التقييم، تُفلتره الخوارزميات، يتحقق النظام من هوية المشتري، ثم يُنشر مع وسم "مشتري موثّق".',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'هل الرابط يُستخدم أكثر من مرة؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'لا، كل رابط صالح لاستخدام واحد فقط لكل طلب.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'ماذا يحدث للتقييمات غير اللائقة؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'يتم كشف الكلمات المسيئة أو المحتوى غير المناسب ورفض التقييم تلقائياً مع إمكانية إخطار المشتري.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'ما قنوات إرسال روابط التقييم؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'SMS وواتساب والبريد الإلكتروني.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'متى يُنشر التقييم؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'يُنشر فوراً إذا اجتاز الفلترة، وقد يتأخر التقييم المُعلّم للمراجعة وفق إعدادات المتجر.',
                  },
                },
              ],
            }),
          }}
        />
      </main>
    </>
  );
}
