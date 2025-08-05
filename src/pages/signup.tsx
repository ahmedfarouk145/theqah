'use client';

import { useState, FormEvent } from 'react';
import { getAuth, createUserWithEmailAndPassword, AuthError } from 'firebase/auth';
import { app, db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast, Toaster } from 'sonner';
import { motion } from 'framer-motion';
import { Mail, Key, Store } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const SALLA_CLIENT_ID = process.env.NEXT_PUBLIC_SALLA_CLIENT_ID!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!;

export default function SignupPage() {
  const auth = getAuth(app);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. إنشاء المستخدم
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // 2. حفظ بيانات المتجر
      await setDoc(doc(db, 'stores', uid), {
        storeName,
        email,
        createdAt: new Date().toISOString(),
        sallaConnected: false,
      });

      toast.success('🎉 تم إنشاء الحساب بنجاح');

      // 3. فتح صفحة تسجيل دخول سلة في نافذة جديدة
      window.open('https://salla.sa/login', '_blank');

      // 4. التوجيه إلى OAuth مع تمرير uid عبر state parameter
      setTimeout(() => {
        const redirectUri = `${BASE_URL}/api/salla/callback`;
        const state = btoa(JSON.stringify({ uid, timestamp: Date.now() }));
        const sallaAuthUrl = `https://salla.sa/oauth/authorize?response_type=code&client_id=${SALLA_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
        
        console.log('🔗 Redirecting to Salla OAuth:', sallaAuthUrl);
        window.location.href = sallaAuthUrl;
      }, 4000);
    } catch (err) {
      const error = err as AuthError;
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل.',
        'auth/invalid-email': 'البريد الإلكتروني غير صالح.',
        'auth/weak-password': 'كلمة المرور ضعيفة. يجب أن تكون 6 أحرف على الأقل.',
      };
      toast.error(messages[error.code] || 'حدث خطأ أثناء التسجيل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e3f4e0] via-[#f0fdf4] to-[#d9f2e3] px-4">
      <Toaster position="top-center" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-lg bg-white border border-[#cce4d5] shadow-xl rounded-2xl p-8"
      >
        <div className="text-center space-y-4">
          <Image src="/logo.png" alt="Logo" width={60} height={60} className="mx-auto" />
          <h1 className="text-2xl font-bold text-[#004225]">✨ أنشئ متجرك بسهولة</h1>
          <p className="text-sm text-gray-600">سجّل خلال دقيقة واحدة فقط</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-5 mt-6">
          <div className="relative">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-[#004225]/60" />
            <Input
              type="text"
              placeholder="اسم المتجر"
              required
              className="pl-10 border border-[#cbe4d6] rounded-lg text-gray-800 bg-[#f6fff9] focus:ring-[#b1e1c5]"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </div>

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#004225]/60" />
            <Input
              type="email"
              placeholder="البريد الإلكتروني"
              required
              dir="ltr"
              className="pl-10 border border-[#cbe4d6] rounded-lg text-gray-800 bg-[#f6fff9] focus:ring-[#b1e1c5]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-[#004225]/60" />
            <Input
              type="password"
              placeholder="كلمة المرور"
              required
              dir="ltr"
              className="pl-10 border border-[#cbe4d6] rounded-lg text-gray-800 bg-[#f6fff9] focus:ring-[#b1e1c5]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-[#a3d9b1] hover:bg-[#93cea3] text-[#004225] font-semibold rounded-lg transition"
          >
            {loading ? '⏳ جاري التسجيل...' : '🚀 إنشاء الحساب'}
          </Button>

          <p className="text-center text-sm text-gray-600 mt-2">
            لديك حساب؟{' '}
            <Link href="/login" className="text-[#004225] underline hover:text-[#006e46] transition-colors">
              تسجيل الدخول
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}