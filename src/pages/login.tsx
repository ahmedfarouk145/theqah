// src/pages/login.tsx
'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { app, db } from '@/lib/firebase';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

type AuthClaims = {
  role?: string;
  admin?: boolean;
  roles?: { admin?: boolean };
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const auth = getAuth(app);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const emailValue = email.trim();
  const isEmailValid = emailPattern.test(emailValue);
  const canSubmit = isEmailValid && password.length > 0 && !loading;

  const map = (code: string) =>
    ({
      'auth/invalid-email': 'البريد الإلكتروني غير صالح.',
      'auth/user-disabled': 'تم تعطيل هذا الحساب.',
      'auth/too-many-requests': 'محاولات كثيرة. حاول لاحقًا.',
      'auth/network-request-failed': 'انقطاع بالشبكة. حاول مجددًا.',
      'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'auth/wrong-password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'auth/user-not-found': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'permission-denied': 'تم تسجيل الدخول بنجاح، جاري التحويل...',
    } as Record<string, string>)[code] || 'تعذّر تسجيل الدخول حالياً.';

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!isEmailValid || !password) {
      setError('يرجى إدخال بريد إلكتروني صالح وكلمة المرور.');
      return;
    }

    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, emailValue, password);

      // 1) اقرأ الـ claims بعد فورس ريفرش
      const token = await cred.user.getIdTokenResult(true);
      const c = token.claims as AuthClaims;

      // ندعم أشكال متعدّدة للـ claims: role='admin' أو admin=true أو roles.admin=true
      let isAdmin = c?.role === 'admin' || c?.admin === true || c?.roles?.admin === true;

      // 2) لو مفيش claim، افحص Firestore: roles/{uid}
      if (!isAdmin) {
        try {
          const snap = await getDoc(doc(db, 'roles', cred.user.uid));
          if (snap.exists()) {
            const data = snap.data() as AuthClaims;
            isAdmin = data?.role === 'admin' || data?.admin === true || data?.roles?.admin === true;
          }
        } catch (roleError) {
          // في حالة فشل قراءة الأدوار، نكمل كمستخدم عادي
          console.warn('Could not read user role from Firestore:', roleError);
          isAdmin = false;
        }
      }

      // 3) التحويل
      await router.push(isAdmin ? '/admin/dashboard' : '/dashboard');
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      console.error('Login error:', authErr?.code, authErr?.message);
      setError(map(String(authErr?.code || '')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-emerald-100/50 px-4 py-10">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-8 shadow-[0_20px_60px_-35px_rgba(5,150,105,0.45)]"
        noValidate
      >
        <div className="mb-7 text-center">
          <Image src="/logo.png" alt="مشتري موثق" width={56} height={56} className="mx-auto rounded-md" priority />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-emerald-900">تسجيل الدخول</h1>
          <p className="mt-2 text-sm text-gray-600">أدخل بيانات حسابك للوصول إلى لوحة التحكم</p>
        </div>

        <div aria-live="assertive">
          {error ? (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="email">
            البريد الإلكتروني
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            autoFocus
            placeholder="you@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error) || (email.length > 0 && !isEmailValid)}
            aria-describedby="login-email-help"
          />
          <p id="login-email-help" className="mt-1 text-xs text-gray-500">
            استخدم نفس البريد المسجل في المنصة.
          </p>
        </div>

        <div className="mb-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="password">
            كلمة المرور
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              dir="ltr"
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pe-10 text-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
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
        </div>

        <div className="mb-6 text-start text-xs">
          <Link href="/forgot-password" className="text-emerald-700 hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
        </button>

        <p className="mt-5 text-center text-sm text-gray-700">
          لا تملك حسابًا؟{' '}
          <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
            إنشاء حساب جديد
          </Link>
        </p>
      </form>
    </div>
  );
}
