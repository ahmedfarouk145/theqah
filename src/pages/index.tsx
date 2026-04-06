// src/pages/index.tsx
'use client';

import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';

import NavbarLanding from '@/components/NavbarLanding';
import { URLS } from '@/config/constants';

const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), {
  ssr: false,
  loading: () => null,
});

export default function LandingPage() {
  return (
    <>
      <Head>
        <link rel="canonical" href={`${URLS.CANONICAL_ORIGIN}/`} />
        <meta property="og:url" content={`${URLS.CANONICAL_ORIGIN}/`} />
        <meta name="robots" content="index, follow" />
      </Head>
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
              <span className="text-green-700">وضاعف مبيعاتك</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg md:text-xl text-gray-700 leading-relaxed max-w-2xl mx-auto">
              مع أول منصة سعودية تضمن مصداقية التقييم بربطه بـ (مشتري حقيقي)؛ عبر أتمتة كاملة لجمع التقييمات وعرضها كشهادة ثقة تدفع العميل للشراء فوراً.
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
              اشترِ وأنت متطمن.. أكثر من 5,000 تقييم تم التحقق من صحته ومطابقته للطلب
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <Link href="/signup">
                <button className="group bg-green-700 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-full text-lg font-bold shadow-lg shadow-green-500/20 hover:bg-green-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                  ابدأ الآن
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

        {/* Install & Videos Section - moved to top */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <span className="inline-block bg-green-100 text-green-700 text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                ابدأ في دقائق
              </span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-4">
                حمّل التطبيق وشاهد الشرح
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                تطبيق مشتري موثّق متاح على متجر سلة — حمّله الآن وشاهد الفيديوهات التوضيحية
              </p>
            </div>

            {/* Salla App Store Button */}
            <div className="text-center mb-12">
              <a
                href="https://apps.salla.sa/ar/app/1180703836"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-green-700 text-white px-8 sm:px-10 py-4 rounded-2xl text-lg font-bold shadow-lg shadow-green-500/20 hover:bg-green-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 15v3H6v-3H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2zm-1-4-1.41-1.41L13 12.17V4h-2v8.17L8.41 9.59 7 11l5 5 5-5z" />
                </svg>
                حمّل التطبيق من متجر سلة
              </a>
            </div>

            {/* TikTok Videos + YouTube Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 max-w-3xl mx-auto">
              {/* Video 1 - What is مشتري موثق */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-green-900 mb-4">ماهو مشتري موثّق؟</h3>
                <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-100 bg-black">
                  <iframe
                    src="https://www.tiktok.com/player/v1/7610461655754935572?&music_info=1&description=1"
                    className="w-full"
                    style={{ height: '580px' }}
                    allow="fullscreen"
                    allowFullScreen
                    title="ماهو مشتري موثّق"
                  />
                </div>
                <a
                  href="https://youtube.com/shorts/UqvdRG1ogN8?si=Qdo1Lpd9DMeE6TiP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  شاهد على يوتيوب
                </a>
              </div>

              {/* Video 2 - How to connect */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-green-900 mb-4">كيف تربط متجرك؟</h3>
                <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-100 bg-black">
                  <iframe
                    src="https://www.tiktok.com/player/v1/7605638835929664786?&music_info=1&description=1"
                    className="w-full"
                    style={{ height: '580px' }}
                    allow="fullscreen"
                    allowFullScreen
                    title="كيف تربط متجرك مع مشتري موثق"
                  />
                </div>
                <a
                  href="https://youtube.com/shorts/s6gBXoANREY?si=YNKmQ1CxPpFatRoU"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  شاهد على يوتيوب
                </a>
              </div>
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
                  emoji: (
                    <div className="relative w-12 h-12">
                      <Image
                        src="/logo.png"
                        alt="شعار مشتري موثّق"
                        fill
                        className="object-contain"
                      />
                    </div>
                  ),
                  title: 'شارة الثقة تظهر',
                  desc: 'تظهر "شارة التوثيق" تلقائياً بجانب التقييمات الصادقة ليعرف زوارك أنها من مشترين حقيقيين.',
                  color: 'bg-orange-500'
                },
                {
                  num: '5',
                  emoji: (
                    <div className="relative w-12 h-12">
                      <Image
                        src="/logo.png"
                        alt="شهادة توثيق التقييمات"
                        fill
                        className="object-contain"
                      />
                    </div>
                  ),
                  title: 'شهادة توثيق التقييمات',
                  desc: 'يعرض الويدجت "شهادة توثيق" رسمية للتقييمات، مما يعزز مصداقية متجرك ويزيد ثقة العملاء.',
                  color: 'bg-teal-500'
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
                  جرّب الآن
                </button>
              </Link>
            </div>
          </div>
        </section>



        {/* CTA Section */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 bg-white text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-4">جاهز لزيادة مبيعاتك؟</h2>
            <p className="text-gray-600 mb-8 text-lg">انضم الى العديد من المتاجر التي حسّنت ثقة عملائها مع مشتري موثّق</p>
            <Link href="/signup">
              <button className="bg-green-700 text-white px-10 sm:px-12 py-4 rounded-full text-lg font-bold shadow-lg hover:bg-green-800 hover:shadow-xl hover:scale-105 active:scale-100 transition-all duration-300">
                ابدأ الآن
              </button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        {/* Footer */}
        <footer className="bg-white py-10 pb-28 text-gray-800 border-t border-gray-200">
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
              <a href="https://www.qudwa.org.sa" target="_blank" rel="noopener noreferrer" title="جمعية قدوة" className="opacity-80 hover:opacity-100 transition">
                <Image src="/qudwa-logo.png" alt="جمعية قدوة" width={55} height={55} loading="lazy" />
              </a>
              <a href="https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000203970" target="_blank" rel="noopener noreferrer" title="التحقق الإلكتروني" className="opacity-80 hover:opacity-100 transition">
                <Image src="/eauth-logo.png" alt="التحقق الإلكتروني" width={38} height={38} style={{ width: 'auto', height: 38 }} loading="lazy" />
              </a>
            </div>

            <div className="text-xs text-gray-500 pt-4 border-t border-gray-100">
              <p>© {new Date().getFullYear()} مُشتري موثّق. جميع الحقوق محفوظة.</p>
              <a href="https://drive.google.com/file/d/1HTVS6PJeV5p9jOHFWq_8Kc_VC-gpQZVg/view?usp=drivesdk" target="_blank" rel="noopener noreferrer" className="mt-1 block hover:text-green-700 transition-colors">
                النظام مسجّل ومحمي قانونيًا لدى الهيئة السعودية للملكية الفكرية
              </a>
              {/* Social Media Icons */}
              <div className="flex justify-center items-center gap-3 mt-4">
                <a href="https://www.tiktok.com/@theqahapp" target="_blank" rel="noopener noreferrer" title="TikTok" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-700 hover:scale-110 transition-all duration-300">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.14a8.16 8.16 0 0 0 4.77 1.52V7.21a4.85 4.85 0 0 1-1.01-.52z" /></svg>
                </a>
                <a href="https://x.com/theqahapp" target="_blank" rel="noopener noreferrer" title="X (Twitter)" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-700 hover:scale-110 transition-all duration-300">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="https://www.instagram.com/theqahapp" target="_blank" rel="noopener noreferrer" title="Instagram" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-700 hover:scale-110 transition-all duration-300">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" /></svg>
                </a>
              </div>
            </div>
          </div>
        </footer>

      </main>

      <FeedbackWidget />
    </>
  );
}
