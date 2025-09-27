// src/pages/signup.tsx
'use client';

import { useState, FormEvent } from 'react';
import { getAuth, createUserWithEmailAndPassword, AuthError } from 'firebase/auth';
import { app, db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast, Toaster } from 'sonner';
import { motion } from 'framer-motion';
import { Mail, Key, Store, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const auth = getAuth(app);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // نحفظ المتجر ومعه حالات الربط المبدئية لزد وسلّة (غير متصل)
      await setDoc(doc(db, 'stores', uid), {
        storeName,
        email,
        createdAt: new Date().toISOString(),
        zid: { connected: false, tokens: null },
        salla: { connected: false, tokens: null },
      });

      toast.success('🎉 تم إنشاء الحساب — اختر منصة الربط في الخطوة التالية');
      router.push('/connect');
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
        {/* Header */}
        <div className="text-center space-y-4">
          <Image src="/logo.png" alt="شعار مشتري موثّق" width={60} height={60} className="mx-auto" />
          <h1 className="text-2xl font-bold text-[#004225]">✨ أنشئ حسابك في مشتري موثّق</h1>
          <p className="text-sm text-gray-600">سجّل خلال دقيقة، ثم اختر ربط زد أو سلّة</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} className="space-y-5 mt-6">
          {/* Store Name */}
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

          {/* Email */}
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

          {/* Password */}
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

          {/* Signup Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-[#a3d9b1] hover:bg-[#93cea3] text-[#004225] font-semibold rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : '🚀 إنشاء الحساب'}
          </Button>

          {/* Login Link */}
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
