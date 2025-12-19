import Head from "next/head";
import Link from "next/link";
import { ShoppingBag, Zap, ArrowRight, CheckCircle } from "lucide-react";

export default function ConnectIndex() {
  const platforms = [
    {
      name: "منصة زد",
      id: "zid",
      href: "/connect/zid",
      color: "from-blue-500 to-blue-600",
      bgColor: "from-blue-50 to-blue-100/50",
      icon: Zap,
      description: "منصة التجارة الإلكترونية الرائدة في المملكة",
      features: ["ربط تلقائي", "إشعارات فورية", "تقارير شاملة"]
    },
    {
      name: "منصة سلة",
      id: "salla",
      href: "/connect/salla",
      color: "from-green-500 to-emerald-600",
      bgColor: "from-green-50 to-emerald-100/50",
      icon: ShoppingBag,
      description: "حلول متكاملة للتجارة الإلكترونية",
      features: ["تكامل سلس", "معالجة ذكية", "دعم متقدم"]
    }
  ];

  return (
    <>
      <Head><title>ربط متجرك | مشتري موثق</title></Head>
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-green-50/30">
        <div className="max-w-4xl mx-auto p-6 py-12">
          {/* Header - CSS animation instead of framer-motion */}
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">اختَر منصتك للبدء</h1>
            <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
              اربط متجرك مع مشتري موثق لإرسال روابط التقييمات تلقائيًا بعد كل عملية شراء ناجحة
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {platforms.map((platform, index) => (
              <div
                key={platform.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <Link
                  href={platform.href}
                  className="group block"
                >
                  <div className={`relative rounded-2xl bg-gradient-to-br ${platform.bgColor} border border-gray-200/50 p-8 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 overflow-hidden`}>
                    {/* Background Decoration */}
                    <div className="absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br from-white/30 to-transparent rounded-full blur-2xl" />

                    <div className="relative z-10">
                      {/* Icon */}
                      <div className={`w-16 h-16 bg-gradient-to-br ${platform.color} rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        <platform.icon className="w-8 h-8 text-white" />
                      </div>

                      {/* Title & Description */}
                      <h3 className="text-2xl font-bold text-gray-900 mb-3 group-hover:text-gray-800">{platform.name}</h3>
                      <p className="text-gray-600 mb-6 leading-relaxed">{platform.description}</p>

                      {/* Features */}
                      <div className="space-y-3 mb-8">
                        {platform.features.map((feature, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                            <span className="text-gray-700">{feature}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA Button */}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 font-medium">ابدأ الربط الآن</span>
                        <div className="flex items-center gap-2 text-gray-700 group-hover:text-gray-900 transition-colors">
                          <span>متابعة</span>
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </div>

                    {/* Hover Effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {/* Help Section */}
          <div className="mt-12 text-center animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/50 p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">تحتاج مساعدة؟</h3>
              <p className="text-gray-600 mb-4">فريق الدعم متاح لمساعدتك في عملية الربط</p>
              <Link
                href="/support"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                تواصل مع الدعم
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
