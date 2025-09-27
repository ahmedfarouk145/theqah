// src/pages/login.tsx
'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Loader2 } from 'lucide-react';

import { app, db } from '@/lib/firebase';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function LoginPage() {
  const router = useRouter();
  const auth = getAuth(app);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const map = (code: string) =>
    ({
      'auth/invalid-email': 'البريد الإلكتروني غير صالح.',
      'auth/user-disabled': 'تم تعطيل هذا الحساب.',
      'auth/too-many-requests': 'محاولات كثيرة. حاول لاحقًا.',
      'auth/network-request-failed': 'انقطاع بالشبكة. حاول مجددًا.',
      'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'auth/wrong-password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'auth/user-not-found': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    } as Record<string, string>)[code] || 'تعذّر تسجيل الدخول حالياً.';

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      // 1) اقرأ الـ claims بعد فورس ريفرش
      const token = await cred.user.getIdTokenResult(true);
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = token.claims as any;

      // ندعم أشكال متعدّدة للـ claims: role='admin' أو admin=true أو roles.admin=true
      let isAdmin =
        c?.role === 'admin' ||
        c?.admin === true ||
        (c?.roles && c.roles.admin === true);

      // 2) لو مفيش claim، افحص Firestore: roles/{uid}
      if (!isAdmin) {
        const snap = await getDoc(doc(db, 'roles', cred.user.uid));
        if (snap.exists()) {
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = snap.data() as any;
          isAdmin =
            data?.role === 'admin' ||
            data?.admin === true ||
            (data?.roles && data.roles.admin === true);
        }
      }

      // 3) التحويل
      router.push(isAdmin ? '/admin/dashboard' : '/dashboard');
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Login error:', err?.code, err?.message);
      setError(map(String(err?.code || '')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-white px-4">
      <form onSubmit={handleLogin} className="w-full max-w-md bg-white p-8 rounded-xl shadow-md border" noValidate>
        <div className="text-center space-y-3 mb-6">
          <Image src="/logo.png" alt="مشتري موثّق" width={56} height={56} className="mx-auto rounded" />
          <h1 className="text-2xl font-extrabold text-green-900">تسجيل الدخول إلى مشتري موثّق</h1>
          <p className="text-sm text-gray-600">مرحبًا بك، أدخل بياناتك للمتابعة</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-center">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium text-gray-700" htmlFor="email">البريد الإلكتروني</label>
        <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            placeholder="you@example.com"
            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
          />
        </div>

        <div className="mb-2">
          <label className="block mb-1 text-sm font-medium text-gray-700" htmlFor="password">كلمة المرور</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            dir="ltr"
            placeholder="••••••••"
            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
          />
        </div>

        <div className="text-left text-xs mb-6">
          <Link href="/forgot-password" className="text-green-700 hover:underline">نسيت كلمة المرور؟</Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-700 text-white py-2 rounded-lg hover:bg-green-800 transition flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
        </button>

        <div className="text-center text-sm mt-5">
          لا تملك حساب؟ <Link href="/signup" className="text-green-700 font-medium hover:underline">أنشئ حساب جديد</Link>
        </div>
      </form>
    </div>
  );
}
