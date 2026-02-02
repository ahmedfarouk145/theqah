// src/pages/faq.tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import NavbarLanding from '@/components/NavbarLanding';

// FAQ data for cleaner code
const faqItems = [
  {
    q: 'ما هي خدمة مشتري موثّق؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        نظام <strong>طرف ثالث محايد وذكي</strong> يعمل في الخلفية لتوثيق تقييمات متجرك تلقائياً،
        حيث يقوم بمطابقة كل تقييم جديد مع بيانات الطلب الفعلي،
        ويمنحه شارة <strong>&quot;مشتري موثّق&quot;</strong> فور التأكد من مصداقيته.

      </p>
    ),
  },
  {
    q: 'كيف يعمل مشتري موثّق؟',
    a: (
      <ol className="list-decimal list-inside space-y-2 text-gray-700">
        <li><strong>التفعيل:</strong> اربط الخدمة بمتجرك بضغطة زر.</li>
        <li><strong>التقييم:</strong> يقيّم العميل طلبَهُ بالطريقة المعتادة.</li>
        <li><strong>التدقيق:</strong> يفحص نظامنا صحة الطلب آلياً في الخلفية.</li>
        <li><strong>الاعتماد:</strong> تظهر شارة التوثيق فوراً على التقييم الصحيح.</li>
      </ol>
    ),
  },

  {
    q: 'ماذا يحدث للتقييمات غير اللائقة؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        يتم كشف الكلمات النابية/غير المناسبة ورفض التقييم تلقائيًا، مع إمكانية إشعار المشتري لإعادة الإرسال
        بصيغة مناسبة.
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
    q: 'هل يمكن لصاحب المتجر التحكم في عرض التقييمات؟',
    a: (
      <div className="text-gray-700 leading-relaxed space-y-3">
        <p>
          <strong>نعم، لديك تحكم كامل.</strong>
        </p>
        <p>
          يمكنك إظهار أو إخفاء التقييمات واختيار المناسب منها للنشر، بما يتوافق مع استراتيجيتك التسويقية وصورة متجرك.
        </p>
        <div className="bg-green-50 border-r-4 border-green-500 p-3 rounded-lg text-sm text-green-900 font-medium">
          نمنحك المرونة الكاملة لإدارة واجهة متجرك دون أي قيود.
        </div>
      </div>
    ),
  },
  {
    q: 'ماذا يحدث للتقييمات الموثّقة عند انتهاء الاشتراك؟',
    a: (
      <div className="text-gray-700 leading-relaxed space-y-4">
        <p>
          التقييمات نفسها <strong>لا تختفي</strong>، لأنها ملك للمتجر بعد توثيقها. لكن الذي يتوقف ظهوره هو شهادة توثيق التقييمات المرتبطة بالاشتراك واللوجو.
        </p>

        <div>
          <p className="font-bold text-gray-800 mb-2">وذلك للأسباب التالية:</p>
          <ul className="list-disc list-outside mr-5 space-y-2 marker:text-green-600">
            <li><strong>التقييمات ملك للمتجر</strong> ولا تحذف بانتهاء الاشتراك.</li>
            <li>الاشتراك مرتبط فقط <strong>بالمزايا الإضافية</strong> (مثل الشارة والتوثيق الجديد).</li>
          </ul>
        </div>

        <div className="bg-green-50 border-r-4 border-green-500 p-3 rounded-lg text-sm text-green-900 font-medium">
          <span className="font-bold block mb-1">بمعنى واضح:</span>
          التقييمات السابقة تبقى كما هي. الذي يتوقف فقط هو توثيق التقييمات الجديدة وظهور شارة التوثيق.
        </div>
      </div>
    ),
  },

  {
    q: 'كيف أبدأ؟',
    a: (
      <p className="text-gray-700 leading-relaxed">
        اربط متجرك مع مشتري موثّق، وفَعِّل قنوات الإرسال، واضبط إعدادات النشر. ابدأ الآن من
        <Link href="/signup" className="text-green-700 font-semibold hover:underline mr-1">
          صفحة التسجيل
        </Link>
        .
      </p>
    ),
  },
];



function FAQItem({ question, answer, isOpen, onClick, index }: { question: string, answer: React.ReactNode, isOpen: boolean, onClick: () => void, index: number }) {
  return (
    <div
      className={`group border border-gray-100 rounded-2xl bg-white overflow-hidden transition-all duration-300 ${isOpen ? 'shadow-lg ring-1 ring-green-100' : 'hover:shadow-md hover:border-green-50'}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-6 text-right focus:outline-none"
        aria-expanded={isOpen ? "true" : "false"}
      >
        <span className={`text-lg md:text-xl font-bold transition-colors ${isOpen ? 'text-green-800' : 'text-gray-800 group-hover:text-green-700'}`}>
          {question}
        </span>
        <span className={`flex-shrink-0 ml-4 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-green-100 rotate-180' : 'bg-gray-50 group-hover:bg-green-50'}`}>
          <svg
            className={`w-5 h-5 transition-colors ${isOpen ? 'text-green-600' : 'text-gray-400 group-hover:text-green-600'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-6 pt-0 text-gray-600 leading-relaxed border-t border-dashed border-gray-100 mt-2">
          {answer}
        </div>
      </div>
    </div>
  );
}

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number>(0);

  // Fix scroll position issue
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <NavbarLanding />
      <div className="h-20" />

      <main className="font-sans text-[#0e1e1a] bg-white overflow-x-hidden min-h-screen" dir="rtl">
        {/* Hero - CSS animation */}
        <section className="py-20 flex flex-col justify-center items-center text-center px-6 bg-gradient-to-b from-green-50/50 to-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-green-100/40 via-transparent to-transparent opacity-70 pointer-events-none" />

          <div className="z-10 max-w-3xl space-y-6 animate-slide-up relative">
            <div className="inline-block p-3 bg-green-100 rounded-full mb-2 animate-bounce-slow">
              <Image src="/logo.png" alt="مشتري موثّق" width={48} height={48} className="w-12 h-12 object-contain" priority />
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-green-900 leading-tight tracking-tight">
              الأسئلة الشائعة
            </h1>
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
              كل ما تحتاج معرفته عن <span className="text-green-700 font-bold">مشتري موثّق</span>.. إجابات واضحة لتبدأ رحلة الثقة.
            </p>
          </div>
        </section>

        {/* FAQ Accordion Section */}
        <section className="pb-24 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">

            <div className="space-y-4">
              {faqItems.map((faq, idx) => (
                <FAQItem key={idx} question={faq.q} answer={faq.a} isOpen={openIndex === idx} onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)} index={idx} />
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
              ابدأ الآن
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
                  name: 'ماذا يحدث للتقييمات غير اللائقة؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'يتم كشف الكلمات النابية أو المحتوى غير المناسب ورفض التقييم تلقائياً مع إمكانية إخطار المشتري.',
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
