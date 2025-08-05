'use client';

import { useState } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { FcGoogle } from 'react-icons/fc';

export default function SignupPage() {
  const auth = getAuth(app);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      alert('تم تسجيل الدخول بنجاح عبر Google!');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('حدث خطأ أثناء تسجيل الدخول بـ Google');
      }
    }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('يرجى إدخال البريد وكلمة المرور');
      setLoading(false);
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert('تم إنشاء الحساب بنجاح!');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('حدث خطأ أثناء إنشاء الحساب');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg px-8 py-10 space-y-6">
        {/* العنوان */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-blue-700 mb-2">مرحبًا بك في ثقة</h1>
          <p className="text-gray-500 text-sm">أنشئ حسابك وابدأ في استقبال التقييمات باحترافية</p>
        </div>

        {/* Google Button */}
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-lg hover:shadow transition"
        >
          <FcGoogle size={20} />
          <span className="text-sm font-medium">التسجيل باستخدام Google</span>
        </button>

        {/* Divider */}
        <div className="text-center text-gray-400 text-sm">أو عبر البريد</div>

        {/* Form */}
        <form onSubmit={handleEmailSignup} className="space-y-4">
          <div>
            <label htmlFor="email" className="block mb-1 font-medium text-gray-700">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label htmlFor="password" className="block mb-1 font-medium text-gray-700">
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded p-2 border border-red-200">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition disabled:opacity-50"
          >
            {loading ? 'جاري التسجيل...' : 'إنشاء حساب'}
          </button>
        </form>
      </div>
    </main>
  );
}
