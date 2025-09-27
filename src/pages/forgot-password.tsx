'use client';

import { useState, FormEvent } from 'react';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { app } from '@/lib/firebase';
import Image from 'next/image';
import Link from 'next/link';
import { Loader as Loader2, Mail, ArrowRight, CircleCheck as CheckCircle, CircleAlert as AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const auth = getAuth(app);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setOkMsg('');
    setErrMsg('');
    setLoading(true);
    try {
      // اختياري: تخصيص الـ continue URL
      const actionCodeSettings = {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      };
      await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
      setOkMsg('✅ تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني.');
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const code = String(err?.code || '');
      const map: Record<string, string> = {
        'auth/invalid-email': 'البريد الإلكتروني غير صالح.',
        'auth/user-not-found': 'لا يوجد مستخدم بهذا البريد.',
        'auth/too-many-requests': 'عدد محاولات كبير — حاول لاحقًا.',
      };
      setErrMsg(map[code] || 'حدث خطأ أثناء الإرسال. حاول لاحقًا.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-emerald-200/30 to-green-200/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-gradient-to-tr from-teal-200/30 to-cyan-200/20 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative">
        {/* Main card */}
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-white/20 transition-all duration-300 hover:shadow-2xl">
          {/* Header */}
          <div className="text-center space-y-4 mb-8">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Image src="/logo.png" alt="مشتري موثّق" width={32} height={32} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-green-700 bg-clip-text text-transparent">
                إعادة تعيين كلمة المرور
              </h1>
              <p className="text-gray-600 text-sm leading-relaxed">
                ادخل عنوان بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور
              </p>
            </div>
          </div>

          {/* Success message */}
          {okMsg && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-emerald-800 text-sm font-medium leading-relaxed">{okMsg}</p>
            </div>
          )}

          {/* Error message */}
          {errMsg && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-red-800 text-sm font-medium leading-relaxed">{errMsg}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-600" />
                البريد الإلكتروني
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  required
                  dir="ltr"
                  placeholder="you@example.com"
                  className="h-12 pl-4 pr-11 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 text-left placeholder:text-gray-400"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errMsg}
                />
                <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full h-12 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>جارٍ الإرسال...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>إرسال رابط إعادة التعيين</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-600">
              تذكرت كلمة المرور؟{' '}
              <Link 
                href="/login" 
                className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors duration-200 hover:underline"
              >
                العودة لتسجيل الدخول
              </Link>
            </p>
          </div>
        </div>

        {/* Additional info card */}
        <div className="mt-6 bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/20 text-center">
          <p className="text-xs text-gray-500 leading-relaxed">
            إذا لم تتلق الرسالة خلال بضع دقائق، تحقق من مجلد البريد العشوائي أو حاول مرة أخرى
          </p>
        </div>
      </div>
    </div>
  );
}