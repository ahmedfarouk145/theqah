// src/pages/index.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import NavbarLanding from '@/components/NavbarLanding';

const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), {
  ssr: false,
  loading: () => null,
});

export default function LandingPage() {
  const [storesCount, setStoresCount] = useState(300);
  const [reviewsCount, setReviewsCount] = useState(5000);

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

      <main className="font-sans text-[#0e1e1a] bg-white" role="main">
        {/* Hero Section */}
        <section className="min-h-[85vh] flex flex-col justify-center items-center text-center px-4 sm:px-6 bg-white relative overflow-hidden">
          <div className="max-w-3xl space-y-6 z-10 animate-slide-up">
            {/* Logo with premium effects */}
            <div className="relative inline-block group animate-float max-w-[80vw]">
              {/* Outer glow ring */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-300/30 via-emerald-400/20 to-green-500/30 rounded-full blur-3xl scale-150 animate-glow-pulse" />

              {/* Inner glow */}
              <div className="absolute inset-0 bg-green-400/30 rounded-full blur-2xl scale-125 animate-glow-pulse" style={{ animationDelay: '0.5s' }} />

              {/* Decorative ring - hidden on very small screens */}
              <div className="absolute -inset-2 sm:-inset-4 border-2 border-green-200/50 rounded-full hidden sm:block" />
              <div className="absolute -inset-4 sm:-inset-8 border border-green-100/30 rounded-full hidden sm:block" />

              {/* Logo - Responsive size */}
              <Image
                src="/logo.png"
                alt="شعار مشتري موثّق"
                width={450}
                height={450}
                className="mx-auto relative drop-shadow-2xl transition-transform duration-500 group-hover:scale-105 w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] md:w-[400px] md:h-[400px] lg:w-[450px] lg:h-[450px]"
                priority
              />

            </div>






            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight text-green-900">
              ابنِ الثقة..
              <br />
              <span className="text-green-700">وضاعف مبيعات متجرك</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg md:text-xl text-gray-700 leading-relaxed max-w-2xl mx-auto">
              أتمتة كاملة لجمع التقييمات وعرضها كشهادة ثقة تدفع العميل للشراء فوراً.
            </p>

            {/* Rating Widget */}
            <div className="inline-flex items-center gap-3 bg-white rounded-full px-5 py-3 shadow-lg border border-gray-100">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span key={star} className="text-yellow-400 text-2xl">★</span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Image src="/logo.png" alt="موثّق" width={28} height={28} />
                <span className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Live Stats */}
            <p className="text-green-600 font-semibold text-sm sm:text-base">
              أكثر من {storesCount.toLocaleString()} متجر و {reviewsCount.toLocaleString()} تقييم موثّق
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <Link href="/signup">
                <button className="group bg-green-700 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-full text-lg font-bold shadow-lg shadow-green-500/20 hover:bg-green-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                  ابدأ الآن مجاناً
                  <span className="inline-block mr-2 group-hover:translate-x-1 transition-transform">←</span>
                </button>
              </Link>
              <Link href="/faq">
                <button className="bg-white text-green-700 border-2 border-green-200 px-6 sm:px-8 py-3.5 sm:py-4 rounded-full text-lg font-semibold hover:bg-green-50 hover:border-green-300 transition-all duration-300">
                  تعرف أكثر
                </button>
              </Link>
            </div>
          </div>
        </section>


        {/* لماذا مشتري موثق - Premium Cards */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 bg-white">


          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <span className="inline-block bg-green-100 text-green-700 text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                لماذا نحن؟
              </span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-4">
                لماذا مشتري موثّق = مبيعات أكثر
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                ضمان طرف ثالث محايد يُزيل تردد العميل ويحوّل الزوار إلى مشترين
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                {
                  emoji: '🎯',
                  color: 'from-amber-400 to-orange-500',
                  bgColor: 'bg-amber-50',
                  title: 'حسم قرار الشراء',
                  desc: 'إزالة تردد العميل لحظة الدفع ورفع معدل التحويل فوراً',
                  stat: '+35%',
                  statLabel: 'معدل التحويل'
                },
                {
                  emoji: '🛒',
                  color: 'from-blue-400 to-indigo-500',
                  bgColor: 'bg-blue-50',
                  title: 'رفع قيمة السلة',
                  desc: 'منح العميل الجرأة والثقة لشراء منتجات أغلى وبكميات أكثر',
                  stat: '+28%',
                  statLabel: 'قيمة الطلب'
                },
                {
                  emoji: '📈',
                  color: 'from-green-400 to-emerald-500',
                  bgColor: 'bg-green-50',
                  title: 'مضاعفة نتائج الإعلانات',
                  desc: 'تحويل الزوار الجدد إلى مشترين بسرعة بفضل ضمان طرف ثالث محايد',
                  stat: '2x',
                  statLabel: 'ROI الإعلانات'
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`group ${item.bgColor} rounded-2xl p-6 sm:p-8 border border-transparent hover:border-green-200 hover:shadow-xl transition-all duration-500 hover:-translate-y-1`}
                >
                  {/* Emoji with gradient bg */}
                  <div className={`w-14 h-14 bg-gradient-to-br ${item.color} rounded-xl flex items-center justify-center text-2xl mb-5 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                    {item.emoji}
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed mb-5">{item.desc}</p>

                  {/* Stat */}
                  <div className="flex items-baseline gap-2 pt-4 border-t border-gray-200/50">
                    <span className={`text-2xl sm:text-3xl font-black bg-gradient-to-l ${item.color} bg-clip-text text-transparent`}>
                      {item.stat}
                    </span>
                    <span className="text-gray-500 text-sm">{item.statLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* كيف يعمل */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-3">
                كيف يعمل مشتري موثّق؟
              </h2>
              <p className="text-gray-600">خطوات بسيطة لبناء ثقة عملائك</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
              {[
                {
                  num: '1',
                  emoji: '🔗',
                  title: 'فعّل التطبيق',
                  desc: 'اربط "مشتري موثّق" بمتجرك في سلة بضغطة زر واحدة، بدون إعدادات معقدة أو خبرة تقنية.',
                  color: 'bg-green-500'
                },
                {
                  num: '2',
                  emoji: '⭐',
                  title: 'العميل يقيّم كالمعتاد',
                  desc: 'يقيّم العميل مشترياته داخل متجرك مباشرة عبر روابط سلة الرسمية، دون أي إزعاج.',
                  color: 'bg-blue-500'
                },
                {
                  num: '3',
                  emoji: '🔒',
                  title: 'التوثيق الفوري',
                  desc: 'نظامنا يتحقق آلياً من "شراء العميل الفعلي" و"اكتمال الطلب" فور وصول التقييم.',
                  color: 'bg-purple-500'
                },
                {
                  num: '4',
                  emoji: '✅',
                  title: 'شارة الثقة تظهر',
                  desc: 'تظهر "شارة التوثيق" تلقائياً بجانب التقييمات الصادقة ليعرف زوارك أنها من مشترين حقيقيين.',
                  color: 'bg-orange-500'
                },
              ].map((step, i) => (
                <div
                  key={i}
                  className="group bg-white rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-lg border border-gray-100 hover:border-green-200 transition-all duration-300 relative"
                >
                  {/* Number Badge */}
                  <span className={`absolute -top-3 -right-3 w-8 h-8 ${step.color} text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md`}>
                    {step.num}
                  </span>

                  {/* Emoji */}
                  <div className="text-3xl sm:text-4xl mb-4">{step.emoji}</div>

                  {/* Content */}
                  <h3 className="text-lg sm:text-xl font-bold text-green-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>

            <div className="text-center mt-10 sm:mt-12">
              <Link href="/signup">
                <button className="bg-green-700 text-white px-10 py-4 rounded-full text-lg font-bold shadow-lg hover:bg-green-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                  جرّب مجاناً الآن
                </button>
              </Link>
            </div>
          </div>
        </section>



        {/* Stats Section */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-green-900 text-center mb-10 sm:mb-12">
              الثقة في الأرقام
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="text-center bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 sm:p-8 border border-green-100">
                <div className="text-3xl sm:text-4xl md:text-5xl font-black text-green-700 mb-2">
                  {storesCount.toLocaleString()}+
                </div>
                <div className="text-green-800 font-semibold">متجر يثق بنا</div>
                <p className="text-green-600/70 text-sm mt-1">من جميع أنحاء المملكة</p>
              </div>
              <div className="text-center bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 sm:p-8 border border-green-100">
                <div className="text-3xl sm:text-4xl md:text-5xl font-black text-green-700 mb-2">
                  {reviewsCount.toLocaleString()}+
                </div>
                <div className="text-green-800 font-semibold">تقييم موثّق</div>
                <p className="text-green-600/70 text-sm mt-1">تقييمات حقيقية</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 bg-white text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-4">جاهز لزيادة مبيعاتك؟</h2>
            <p className="text-gray-600 mb-8 text-lg">انضم إلى آلاف المتاجر التي حسّنت ثقة عملائها مع مشتري موثّق</p>
            <Link href="/signup">
              <button className="bg-green-700 text-white px-10 sm:px-12 py-4 rounded-full text-lg font-bold shadow-lg hover:bg-green-800 hover:shadow-xl hover:scale-105 active:scale-100 transition-all duration-300">
                ابدأ مجاناً الآن
              </button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-white py-10 text-gray-800 border-t border-gray-200">
          <div className="max-w-5xl mx-auto px-4 text-center space-y-6">
            <div className="flex items-center justify-center gap-3">
              <Image src="/logo.png" alt="مشتري موثّق" width={45} height={45} loading="lazy" />
              <span className="text-xl font-bold text-green-800">مشتري موثّق</span>
            </div>

            <nav className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
              <Link href="/privacy-policy" className="hover:text-green-700 hover:underline transition">سياسة الخصوصية</Link>
              <Link href="/terms" className="hover:text-green-700 hover:underline transition">الشروط والأحكام</Link>
              <Link href="/support" className="hover:text-green-700 hover:underline transition">الدعم والمساعدة</Link>
              <Link href="/faq" className="hover:text-green-700 hover:underline transition">الأسئلة الشائعة</Link>
            </nav>

            <div className="flex justify-center gap-5">
              <a href="https://www.qudwa.org.sa" target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 transition">
                <Image src="/qudwa-logo.png" alt="جمعية قدوة" width={55} height={55} loading="lazy" />
              </a>
              <a href="https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000203970" target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 transition">
                <Image src="/eauth-logo.png" alt="التحقق الإلكتروني" width={38} height={38} style={{ width: 'auto', height: 38 }} loading="lazy" />
              </a>
            </div>

            <div className="text-xs text-gray-500 pt-4 border-t border-gray-100">
              <p>© {new Date().getFullYear()} مُشتري موثّق. جميع الحقوق محفوظة.</p>
              <p className="mt-1">النظام مسجّل ومحمي قانونيًا لدى الهيئة السعودية للملكية الفكرية</p>
            </div>
          </div>
        </footer>

      </main>

      <FeedbackWidget />
    </>
  );
}
