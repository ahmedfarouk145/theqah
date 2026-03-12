// src/pages/signup.tsx
'use client';

import { useState, FormEvent } from 'react';
import { getAuth, createUserWithEmailAndPassword, AuthError } from 'firebase/auth';
import { app, db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast, Toaster } from 'sonner';
import { Mail, Key, Store, Loader2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const router = useRouter();
  const auth = getAuth(app);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const trimmedEmail = email.trim();
  const trimmedStoreName = storeName.trim();
  const isEmailValid = emailPattern.test(trimmedEmail);
  const isPasswordStrong = password.length >= 6;
  const isPasswordMatched = confirmPassword.length > 0 && confirmPassword === password;
  const canSubmit = Boolean(trimmedStoreName) && isEmailValid && isPasswordStrong && isPasswordMatched && !loading;

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!trimmedStoreName) {
      setError('يرجى إدخال اسم المتجر.');
      return;
    }
    if (!isEmailValid) {
      setError('يرجى إدخال بريد إلكتروني صالح.');
      return;
    }
    if (!isPasswordStrong) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }
    if (!isPasswordMatched) {
      setError('تأكيد كلمة المرور غير مطابق.');
      return;
    }

    setLoading(true);

    try {
      const userCred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const uid = userCred.user.uid;

      // نحفظ المتجر ومعه حالات الربط المبدئية لزد وسلّة (غير متصل)
      await setDoc(doc(db, 'stores', uid), {
        storeName: trimmedStoreName,
        email: trimmedEmail,
        createdAt: new Date().toISOString(),
        zid: { connected: false, tokens: null },
        salla: { connected: false, tokens: null },
      });

      toast.success('تم إنشاء الحساب بنجاح. اختر منصة الربط في الخطوة التالية.');
      await router.push('/connect');
    } catch (err) {
      const error = err as AuthError;
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل.',
        'auth/invalid-email': 'البريد الإلكتروني غير صالح.',
        'auth/weak-password': 'كلمة المرور ضعيفة. يجب أن تكون 6 أحرف على الأقل.',
      };
      const msg = messages[error.code] || 'حدث خطأ أثناء التسجيل';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-emerald-100/50 px-4 py-10">
      <Toaster position="top-center" />
      <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-8 shadow-[0_20px_60px_-35px_rgba(5,150,105,0.45)]">
        <div className="text-center">
          <Image src="/logo.png" alt="شعار مشتري موثّق" width={56} height={56} className="mx-auto rounded-md" priority />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-emerald-900">إنشاء حساب جديد</h1>
          <p className="mt-2 text-sm text-gray-600">أدخل بيانات متجرك ثم أكمل الربط في الخطوة التالية</p>
        </div>

        <div aria-live="assertive">
          {error ? (
            <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSignup} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="storeName">
              اسم المتجر
            </label>
            <div className="relative">
              <Store className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-800/60" />
              <Input
                id="storeName"
                type="text"
                placeholder="اسم متجرك"
                required
                className="rounded-lg border border-emerald-100 bg-emerald-50/30 ps-9 text-sm text-gray-800 focus-visible:ring-emerald-500/30"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                aria-invalid={Boolean(error) && !trimmedStoreName}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="email">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-800/60" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                required
                dir="ltr"
                autoComplete="email"
                className="rounded-lg border border-emerald-100 bg-emerald-50/30 ps-9 text-sm text-gray-800 focus-visible:ring-emerald-500/30"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error) || (email.length > 0 && !isEmailValid)}
                aria-describedby="signup-email-help"
              />
            </div>
            <p id="signup-email-help" className="mt-1 text-xs text-gray-500">
              سيتم استخدامه للدخول واسترجاع كلمة المرور.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="password">
              كلمة المرور
            </label>
            <div className="relative">
              <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-800/60" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="6 أحرف على الأقل"
                required
                dir="ltr"
                autoComplete="new-password"
                className="rounded-lg border border-emerald-100 bg-emerald-50/30 ps-9 pe-10 text-sm text-gray-800 focus-visible:ring-emerald-500/30"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error) || (password.length > 0 && !isPasswordStrong)}
                aria-describedby="signup-password-help"
              />
              <button
                type="button"
                className="absolute inset-y-0 end-2 flex items-center text-gray-500 hover:text-emerald-700"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p id="signup-password-help" className="mt-1 text-xs text-gray-500">
              يجب أن تكون 6 أحرف على الأقل.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="confirmPassword">
              تأكيد كلمة المرور
            </label>
            <div className="relative">
              <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-800/60" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="أعد إدخال كلمة المرور"
                required
                dir="ltr"
                autoComplete="new-password"
                className="rounded-lg border border-emerald-100 bg-emerald-50/30 ps-9 pe-10 text-sm text-gray-800 focus-visible:ring-emerald-500/30"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={Boolean(error) || (confirmPassword.length > 0 && !isPasswordMatched)}
              />
              <button
                type="button"
                className="absolute inset-y-0 end-2 flex items-center text-gray-500 hover:text-emerald-700"
                onClick={() => setShowConfirmPassword((s) => !s)}
                aria-label={showConfirmPassword ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className={`mt-1 text-xs ${confirmPassword.length === 0 || isPasswordMatched ? 'text-gray-500' : 'text-red-600'}`}>
              {confirmPassword.length === 0 || isPasswordMatched ? 'تأكيد كلمة المرور يساعد على تقليل أخطاء الإدخال.' : 'كلمتا المرور غير متطابقتين.'}
            </p>
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري إنشاء الحساب...
              </>
            ) : (
              'إنشاء الحساب'
            )}
          </Button>

          <p className="text-center text-sm text-gray-700">
            لديك حساب بالفعل؟{' '}
            <Link href="/login" className="font-medium text-emerald-700 hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
