import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <main className="font-sans text-gray-800 bg-white">
      {/* Hero Section */}
      <section className="min-h-screen flex flex-col justify-center items-center text-center px-6 bg-gradient-to-b from-blue-50 to-white">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl"
        >
          <Image
            src="/logo.png"
            alt="ثقة"
            width={80}
            height={80}
            className="mx-auto mb-4"
          />
          <h1 className="text-4xl md:text-5xl font-bold mb-4">ثقة - نظام تقييم بعد الشراء</h1>
          <p className="text-lg md:text-xl mb-6 text-gray-600">
            منصة تساعدك على جمع آراء العملاء بعد الشراء تلقائيًا، ونشرها بثقة.
          </p>
          <Link href="/signup">
            <button className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg hover:bg-blue-700 transition">
              ابدأ الآن مجاناً
            </button>
          </Link>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-10">مميزات ثقة</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: '💬', title: 'إرسال تلقائي للرسائل', desc: 'SMS / واتساب / بريد إلكتروني بعد كل عملية شراء' },
              { icon: '🧹', title: 'فلترة الكلمات', desc: 'منع التقييمات المسيئة تلقائيًا باستخدام الذكاء الاصطناعي' },
              { icon: '🌍', title: 'صفحة عامة للتقييمات', desc: 'عرض التقييمات للزوار مع وسم "مشتري ثقة"' },
            ].map((feat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.2, duration: 0.6 }}
                viewport={{ once: true }}
                className="bg-white shadow-md rounded-xl p-6"
              >
                <div className="text-4xl mb-4">{feat.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feat.title}</h3>
                <p className="text-gray-600">{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-10">كيف يعمل ثقة؟</h2>
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
                className="bg-blue-50 rounded-xl p-5 text-lg"
              >
                <span className="font-bold text-blue-600 ml-2">{i + 1}.</span> {step}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-100 py-6 text-center text-sm text-gray-600">
        <div className="flex justify-center gap-6">
          <Link href="/privacy-policy">سياسة الخصوصية</Link>
          <Link href="/terms">الشروط والأحكام</Link>
          <Link href="/support">الدعم والمساعدة</Link>
        </div>
        <p className="mt-4">© 2025 ثقة - جميع الحقوق محفوظة</p>
      </footer>
    </main>
  );
}
