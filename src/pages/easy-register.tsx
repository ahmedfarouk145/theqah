// src/pages/easy-register.tsx
import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface FormData {
  merchantEmail: string;
  storeName: string;
  storeUrl: string;
  merchantId?: string;
}

export default function EasyRegisterPage() {
  const [formData, setFormData] = useState<FormData>({
    merchantEmail: '',
    storeName: '',
    storeUrl: '',
    merchantId: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    storeUid?: string;
    accessToken?: string;
  } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/stores/easy-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          merchantId: formData.merchantId || undefined,
        }),
      });

      const data = await response.json();
      setResult(data);

    } catch (err) {
      console.error('Registration error:', err);
      setResult({
        success: false,
        message: 'حدث خطأ في الاتصال. حاول مرة أخرى'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>تسجيل متجر جديد - Easy Mode | ثقة</title>
        <meta name="description" content="سجل متجرك في منصة ثقة بطريقة سهلة وسريعة" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-12 px-4" dir="rtl">
        <div className="max-w-md mx-auto">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="bg-white rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-green-600">ثقة</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              تسجيل متجر جديد
            </h1>
            <p className="text-gray-600">
              Easy Mode - التسجيل السريع
            </p>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            
            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">
                📋 الخطوات المطلوبة:
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• املأ البيانات أدناه</li>
                <li>• ستصلك رسالة لإعداد كلمة المرور</li>
                <li>• ستحصل على Access Token للـ API</li>
                <li>• ابدأ باستخدام الخدمة فوراً</li>
              </ul>
            </div>

            {result && (
              <div className={`p-4 rounded-lg mb-6 ${
                result.success 
                  ? 'bg-green-50 border border-green-200 text-green-800' 
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                <p className="font-medium">{result.message}</p>
                
                {result.success && result.accessToken && (
                  <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      🔑 Access Token الخاص بك:
                    </p>
                    <code className="text-xs bg-white p-2 rounded block break-all">
                      {result.accessToken}
                    </code>
                    <p className="text-xs text-gray-600 mt-2">
                      احتفظ بهذا التوكن لاستخدام الـ API
                    </p>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  البريد الإلكتروني *
                </label>
                <input
                  type="email"
                  name="merchantEmail"
                  required
                  value={formData.merchantEmail}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="your-email@example.com"
                  disabled={loading}
                />
              </div>

              {/* Store Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اسم المتجر *
                </label>
                <input
                  type="text"
                  name="storeName"
                  required
                  value={formData.storeName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="اسم متجرك"
                  disabled={loading}
                />
              </div>

              {/* Store URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  رابط المتجر *
                </label>
                <input
                  type="url"
                  name="storeUrl"
                  required
                  value={formData.storeUrl}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="https://your-store.salla.sa"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  رابط متجرك على سلة أو منصة أخرى
                </p>
              </div>

              {/* Merchant ID (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  معرف التاجر (اختياري)
                </label>
                <input
                  type="text"
                  name="merchantId"
                  value={formData.merchantId}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="559541722"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  معرف التاجر من سلة (إن وجد)
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    جاري التسجيل...
                  </>
                ) : (
                  <>
                    🚀 سجل المتجر الآن
                  </>
                )}
              </button>

            </form>

            {/* Footer Links */}
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600 mb-3">
                لديك حساب بالفعل؟
              </p>
              <Link 
                href="/login" 
                className="text-green-600 hover:text-green-700 font-medium text-sm"
              >
                تسجيل الدخول
              </Link>
            </div>

          </div>

        </div>
      </div>
    </>
  );
}

