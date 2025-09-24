import { Zap, Shield, CheckCircle, ArrowRight, Mail, Settings, Webhook } from 'lucide-react';

export default function SallaOAuthInfo() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
  
  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-blue-50/30">
      <div className="max-w-4xl mx-auto py-16 px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/80 backdrop-blur-sm rounded-full shadow-xl border border-gray-200/50 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
              مصادقة سلة — النمط السهل (Easy OAuth)
            </h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            تكامل سلس وآمن مع منصة سلة باستخدام النمط السهل المعتمد من سلة
          </p>
        </div>

        {/* How it Works */}
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl border border-gray-200/50 p-8 shadow-2xl mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-3">
            <Settings className="text-emerald-600" />
            كيف يعمل النمط السهل؟
          </h2>
          
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-6 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl border border-emerald-200/50">
              <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">التاجر يثبّت التطبيق من متجر سلة</h3>
                <p className="text-gray-600 text-sm">يذهب التاجر إلى متجر تطبيقات سلة ويضغط على &ldquo;تثبيت&rdquo; لتطبيق ثقة</p>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="text-gray-400" size={24} />
            </div>

            <div className="flex items-start gap-4 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-200/50">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">سلة ترسل حدث التفويض</h3>
                <p className="text-gray-600 text-sm">
                  تقوم سلة بإرسال حدث <code className="bg-white px-2 py-1 rounded text-xs">app.store.authorize</code> إلى 
                  <code className="bg-white px-2 py-1 rounded text-xs mr-1">{base}/api/salla/webhook</code>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="text-gray-400" size={24} />
            </div>

            <div className="flex items-start gap-4 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-200/50">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">نحفظ التوكن ونجلب معلومات المتجر</h3>
                <ul className="text-gray-600 text-sm space-y-1">
                  <li>• نحفظ <strong>access_token</strong> و <strong>refresh_token</strong> بقاعدة البيانات</li>
                  <li>• نستدعي <strong>Get user information API</strong> لجلب معلومات التاجر</li>
                  <li>• ننشئ/نحدّث سجل المتجر في <code className="bg-white px-1 rounded">stores</code></li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="text-gray-400" size={24} />
            </div>

            <div className="flex items-start gap-4 p-6 bg-gradient-to-r from-pink-50 to-rose-50 rounded-2xl border border-pink-200/50">
              <div className="w-8 h-8 bg-pink-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">إرسال إيميل الترحيب للتاجر</h3>
                <p className="text-gray-600 text-sm">
                  نرسل إيميل ترحيب يحتوي على معلومات الحساب وتعليمات الاستخدام للتاجر
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Requirements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Security */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200/50 p-8 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Shield className="text-blue-600" />
              المعايير الأمنية
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="text-green-600" size={20} />
                <span className="text-gray-700">شهادة SSL مفعلة على الخادم</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="text-green-600" size={20} />
                <span className="text-gray-700">تشفير HTTPS لجميع الاتصالات</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="text-green-600" size={20} />
                <span className="text-gray-700">أمان headers إضافية</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="text-green-600" size={20} />
                <span className="text-gray-700">حماية من XSS و CSRF</span>
              </div>
            </div>
          </div>

          {/* Webhooks */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200/50 p-8 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Webhook className="text-purple-600" />
              Webhooks المطلوبة
            </h3>
            <div className="space-y-3">
              {[
                'app.store.authorize',
                'app.installed', 
                'app.uninstalled',
                'order.created',
                'order.updated',
                'order.shipped'
              ].map((webhook) => (
                <div key={webhook} className="bg-gray-50 px-3 py-2 rounded-lg">
                  <code className="text-sm text-purple-700 font-mono">{webhook}</code>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scopes */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200/50 p-8 shadow-xl mb-12">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Settings className="text-indigo-600" />
            الصلاحيات المطلوبة (Scopes)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-800 mb-3">صلاحيات أساسية (مطلوبة)</h4>
              {[
                { scope: 'offline_access', desc: 'الوصول المستمر' },
                { scope: 'settings.read', desc: 'قراءة إعدادات المتجر' },
                { scope: 'customers.read', desc: 'قراءة بيانات العملاء' },
                { scope: 'orders.read', desc: 'قراءة الطلبات' },
                { scope: 'webhooks.read_write', desc: 'إدارة الإشعارات' }
              ].map(({ scope, desc }) => (
                <div key={scope} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <code className="text-sm text-emerald-700 font-mono block">{scope}</code>
                  <p className="text-xs text-emerald-600 mt-1">{desc}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-800 mb-3">صلاحيات إضافية (اختيارية)</h4>
              {[
                { scope: 'products.read', desc: 'قراءة بيانات المنتجات' },
                { scope: 'notifications.read', desc: 'قراءة الإشعارات' },
                { scope: 'analytics.read', desc: 'الوصول للتحليلات' }
              ].map(({ scope, desc }) => (
                <div key={scope} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <code className="text-sm text-blue-700 font-mono block">{scope}</code>
                  <p className="text-xs text-blue-600 mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Email Notification */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 shadow-xl">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            <Mail className="text-amber-600" />
            إشعار البريد الإلكتروني
          </h3>
          <p className="text-gray-700 mb-4">
            عند نجاح عملية الربط باستخدام النمط السهل، يتم إرسال إيميل ترحيب للتاجر يحتوي على:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> معلومات المتجر</li>
              <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> معرف الربط</li>
              <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> رابط لوحة التحكم</li>
            </ul>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> تعليمات الاستخدام</li>
              <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> معلومات الدعم</li>
              <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> الخطوات التالية</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-gray-500">
          <p className="text-sm">
            تم تصميم هذا التكامل ليكون متوافقاً 100% مع متطلبات ومعايير منصة سلة
          </p>
          <p className="text-xs mt-2">
            نقطة الفحص: <code className="bg-gray-100 px-2 py-1 rounded">{base}/api/salla/verify?uid=salla:&lt;storeId&gt;</code>
          </p>
        </div>
      </div>
    </main>
  );
}
