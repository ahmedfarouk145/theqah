// src/pages/login.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { loginUser } from '@/lib/auth/login';
;

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { role } = await loginUser(email, password);

      console.log("User role:", role);

      // التوجيه حسب الدور
      if (role && role.trim() === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-white px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white p-8 rounded-xl shadow-md border"
      >
        <h1 className="text-3xl font-extrabold text-center text-green-900 mb-6">
          تسجيل الدخول إلى ثقة
        </h1>

        {error && <div className="mb-4 text-red-600 text-sm text-center">{error}</div>}

        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium text-gray-700">
            البريد الإلكتروني
          </label>
          <input
            type="email"
            required
            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
          />
        </div>

        <div className="mb-6">
          <label className="block mb-1 text-sm font-medium text-gray-700">
            كلمة المرور
          </label>
          <input
            type="password"
            required
            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-700 text-white py-2 rounded-lg hover:bg-green-800 transition"
        >
          {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
        </button>

        <p className="text-center text-sm mt-5">
          لا تملك حساب؟{' '}
          <Link href="/signup" className="text-green-700 font-medium hover:underline">
            أنشئ حساب جديد
          </Link>
        </p>
      </form>
    </div>
  );
}
