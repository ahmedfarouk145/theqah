// src/pages/setup-password.tsx
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';

interface SetupData {
  token: string;
  email: string;
  storeName: string;
  valid: boolean;
}

export default function SetupPasswordPage() {
  const router = useRouter();
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // التحقق من صحة التوكن عند تحميل الصفحة
  useEffect(() => {
    const token = router.query.token as string;
    if (!token) return;

    const checkToken = async () => {
      try {
        const response = await fetch('/api/auth/verify-setup-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();
        setSetupData(data);
      } catch (err) {
        console.error('Token verification error:', err);
        setSetupData({
          token,
          email: '',
          storeName: '',
          valid: false,
        });
      } finally {
        setChecking(false);
      }
    };

    checkToken();
  }, [router.query.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setResult({
        success: false,
        message: 'كلمتا المرور غير متطابقتين'
      });
      return;
    }

    if (password.length < 8) {
      setResult({
        success: false,
        message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: setupData?.token,
          password,
        }),
      });

      const data = await response.json();
      setResult(data);

      if (data.success) {
        // إعادة توجيه للوحة التحكم بعد 3 ثوانٍ
        setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      }

    } catch (err) {
      console.error('Password setup error:', err);
      setResult({
        success: false,
        message: 'حدث خطأ في الاتصال. حاول مرة أخرى'
      });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحقق من الرابط...</p>
        </div>
      </div>
    );
  }

  if (!setupData?.valid) {
    return (
      <>
        <Head>
          <title>رابط غير صحيح | ثقة</title>
        </Head>
        
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" dir="rtl">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-red-600 text-2xl">❌</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                رابط غير صحيح
              </h1>
              <p className="text-gray-600 mb-6">
                الرابط غير صحيح أو منتهي الصلاحية. يرجى طلب رابط جديد.
              </p>
              <Link 
                href="/easy-register"
                className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                العودة للتسجيل
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>إعداد كلمة المرور | ثقة</title>
        <meta name="description" content="أكمل إعداد حسابك في منصة ثقة" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-12 px-4" dir="rtl">
        <div className="max-w-md mx-auto">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="bg-white rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-green-600">ثقة</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              إعداد كلمة المرور
            </h1>
            <p className="text-gray-600">
              مرحباً بك في {setupData.storeName}
            </p>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            
            {/* Welcome */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm">
                🎉 تم تسجيل متجرك بنجاح! أكمل إعداد كلمة المرور للبدء.
              </p>
              <p className="text-green-700 text-xs mt-2">
                <strong>البريد الإلكتروني:</strong> {setupData.email}
              </p>
            </div>

            {result && (
              <div className={`p-4 rounded-lg mb-6 ${
                result.success 
                  ? 'bg-green-50 border border-green-200 text-green-800' 
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                <p className="font-medium">{result.message}</p>
                {result.success && (
                  <p className="text-sm mt-2">
                    سيتم توجيهك للوحة التحكم خلال 3 ثوانٍ...
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="كلمة المرور (8 أحرف على الأقل)"
                  disabled={loading}
                  minLength={8}
                />
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  تأكيد كلمة المرور
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="أعد كتابة كلمة المرور"
                  disabled={loading}
                  minLength={8}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || result?.success}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    جاري الإعداد...
                  </>
                ) : result?.success ? (
                  <>✅ تم الإعداد بنجاح</>
                ) : (
                  <>🔐 إعداد كلمة المرور</>
                )}
              </button>

            </form>

            {/* Security Note */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                🔐 كلمة المرور محمية بأعلى معايير الأمان
              </p>
            </div>

          </div>

        </div>
      </div>
    </>
  );
}

