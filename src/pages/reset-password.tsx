'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { getAuth, verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { app } from '@/lib/firebase';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const auth = getAuth(app);

  const [oobCode, setOobCode] = useState<string>('');
  const [email, setEmail] = useState<string>(''); // هنعرضه للتأكيد
  const [newPass, setNewPass] = useState<string>('');
  const [confirmPass, setConfirmPass] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errMsg, setErrMsg] = useState<string>('');
  const [okMsg, setOkMsg] = useState<string>('');

  // نقرأ كود oobCode من الكويري ونتحقق منه
  useEffect(() => {
    const code = String(router.query.oobCode || '');
    if (!code) {
      setErrMsg('الرابط غير صالح. برجاء طلب رابط جديد.');
      setLoading(false);
      return;
    }
    setOobCode(code);
    (async () => {
      try {
        const mail = await verifyPasswordResetCode(auth, code);
        setEmail(mail);
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setErrMsg('الرابط منتهي أو غير صالح. برجاء طلب رابط جديد.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.oobCode]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    setOkMsg('');
    if (newPass.length < 6) {
      setErrMsg('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }
    if (newPass !== confirmPass) {
      setErrMsg('كلمتا المرور غير متطابقتين.');
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPass);
      setOkMsg('✅ تم تعيين كلمة المرور بنجاح. سيتم تحويلك لتسجيل الدخول...');
      setTimeout(() => router.push('/login'), 1200);
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const code = String(err?.code || '');
      const map: Record<string, string> = {
        'auth/expired-action-code': 'انتهت صلاحية الرابط. اطلب رابطًا جديدًا.',
        'auth/invalid-action-code': 'الرابط غير صالح. اطلب رابطًا جديدًا.',
        'auth/user-disabled': 'تم تعطيل هذا الحساب.',
      };
      setErrMsg(map[code] || 'تعذر تعيين كلمة المرور الآن. حاول لاحقًا.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-white px-4">
        <div className="flex items-center gap-2 text-green-800">
          <Loader2 className="h-5 w-5 animate-spin" /> جاري التحقق من الرابط...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-white px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white p-8 rounded-xl shadow-md border" noValidate>
        <div className="text-center space-y-3 mb-6">
          <Image src="/logo.png" alt="مشتري موثّق" width={56} height={56} className="mx-auto rounded" />
          <h1 className="text-2xl font-extrabold text-green-900">تعيين كلمة مرور جديدة</h1>
          {email ? <p className="text-sm text-gray-600">للحساب: <span dir="ltr">{email}</span></p> : null}
        </div>

        {okMsg && (
          <div className="mb-4 text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm text-center">
            {okMsg}
          </div>
        )}
        {errMsg && (
          <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-center">
            {errMsg}
          </div>
        )}

        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium text-gray-700">كلمة المرور الجديدة</label>
          <input
            type="password"
            required
            dir="ltr"
            placeholder="••••••••"
            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">٦ أحرف على الأقل</p>
        </div>

        <div className="mb-6">
          <label className="block mb-1 text-sm font-medium text-gray-700">تأكيد كلمة المرور</label>
          <input
            type="password"
            required
            dir="ltr"
            placeholder="••••••••"
            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-700 text-white py-2 rounded-lg hover:bg-green-800 transition flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}
        </button>

        <div className="text-center text-sm mt-5">
          تذكرت كلمة المرور؟{' '}
          <Link href="/login" className="text-green-700 font-medium hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </form>
    </div>
  );
}
