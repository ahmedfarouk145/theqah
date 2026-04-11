// src/pages/blog/login.tsx
// Dedicated sign-in for the blog admin area. Uses the "blog" Firebase Auth
// instance, which has its own browser session independent of the store and
// admin dashboards.
//
// Visual identity note: this page is intentionally designed to look nothing
// like /login (the store/admin dashboard sign-in). Where /login is a centered
// emerald card, this one is a split-screen editorial layout — dark stone
// masthead on one side, cream form with underline inputs and an amber
// submit button on the other. The contrast makes it obvious at a glance
// that the blog login is a separate surface.
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { blogAuth } from '@/lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// Only this email is allowed to sign into the blog admin. The server-side
// guard (requireBlogOwner) enforces the same rule on every API request —
// this client check is just for a nicer UX.
const BLOG_OWNER_EMAIL = 'abuyzzn@yahoo.com';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BlogLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // If a blog session already exists (and it belongs to the owner), jump
  // straight to /blog/manage. This mirrors the behavior of /admin/login.
  useEffect(() => {
    const unsub = onAuthStateChanged(blogAuth, (u) => {
      if (u && u.email?.toLowerCase() === BLOG_OWNER_EMAIL.toLowerCase()) {
        router.replace('/blog/manage');
      }
    });
    return () => unsub();
  }, [router]);

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
      const cred = await signInWithEmailAndPassword(blogAuth, emailValue, password);

      // Client-side ownership gate. If a non-owner authenticates successfully,
      // drop the blog session immediately so it can't persist.
      if (cred.user.email?.toLowerCase() !== BLOG_OWNER_EMAIL.toLowerCase()) {
        await signOut(blogAuth);
        setError('هذا الحساب لا يملك صلاحيات إدارة المدونة.');
        return;
      }

      await router.replace('/blog/manage');
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      console.error('Blog login error:', authErr?.code, authErr?.message);
      setError(map(String(authErr?.code || '')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-stone-100"
    >
      {/* ───── Left panel: dark editorial masthead ───── */}
      <aside
        className="relative hidden md:flex flex-col justify-between overflow-hidden bg-stone-950 text-stone-100 p-12"
      >
        {/* Decorative rule + kicker */}
        <div>
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-amber-300/80">
            <span className="h-px w-10 bg-amber-300/60" />
            <span>المحرّر</span>
          </div>
          <h1 className="mt-10 font-serif text-6xl leading-[1.05] text-stone-50">
            مدوّنة
            <br />
            <span className="text-amber-300">ثِـقــة</span>
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-stone-300/90">
            غرفة هادئة للكتابة والتحرير، بعيدًا عن ضجيج لوحة التاجر.
            خُصِّصت هذه البوّابة للمُحرّر وحده.
          </p>
        </div>

        {/* Pull quote */}
        <blockquote className="relative mt-10 border-r-2 border-amber-300/60 pr-5 font-serif text-lg italic text-stone-200/90">
          «الكتابة الجيّدة هي إعادة كتابة.»
          <footer className="mt-3 text-xs not-italic tracking-wider text-stone-400">
            — قاعدة المحرّرين
          </footer>
        </blockquote>

        {/* Footer meta row */}
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-stone-500">
          <span>theqah · editorial</span>
          <span>المجلّد ٠١</span>
        </div>

        {/* Subtle grain / vignette using pure CSS (no asset) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 20%, #fff 0, transparent 40%), radial-gradient(circle at 70% 80%, #fff 0, transparent 35%)',
          }}
        />
      </aside>

      {/* ───── Mobile masthead (compact hero shown only < md) ───── */}
      <div className="md:hidden bg-stone-950 text-stone-100 px-6 pt-10 pb-8">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.35em] text-amber-300/80">
          <span className="h-px w-8 bg-amber-300/60" />
          <span>المحرّر</span>
        </div>
        <h1 className="mt-4 font-serif text-4xl leading-[1.05]">
          مدوّنة <span className="text-amber-300">ثِـقــة</span>
        </h1>
      </div>

      {/* ───── Right panel: the form ───── */}
      <main className="flex items-start md:items-center justify-center px-6 py-12 md:p-12">
        <form
          onSubmit={handleLogin}
          noValidate
          className="w-full max-w-md"
        >
          <header className="mb-10">
            <p className="text-[11px] uppercase tracking-[0.3em] text-stone-500">
              Sign in
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold text-stone-900">
              دخول المحرّر
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              هذه المساحة منفصلة تمامًا عن لوحة التاجر. سجّل الدخول بحسابك
              المخوَّل للتحرير في المدوّنة.
            </p>
          </header>

          <div aria-live="assertive">
            {error ? (
              <div
                role="alert"
                className="mb-6 border-s-2 border-red-700 bg-red-50 px-4 py-2 text-sm text-red-800"
              >
                {error}
              </div>
            ) : null}
          </div>

          {/* Email — underline-only, no box */}
          <div className="mb-7">
            <label
              htmlFor="blog-email"
              className="block text-[11px] uppercase tracking-[0.25em] text-stone-500"
            >
              البريد الإلكتروني
            </label>
            <input
              id="blog-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error) || (email.length > 0 && !isEmailValid)}
              className="mt-2 w-full border-b border-stone-400 bg-transparent pb-2 text-base text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
            />
          </div>

          {/* Password — underline-only, with show/hide */}
          <div className="mb-3">
            <label
              htmlFor="blog-password"
              className="block text-[11px] uppercase tracking-[0.25em] text-stone-500"
            >
              كلمة المرور
            </label>
            <div className="relative mt-2">
              <input
                id="blog-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                dir="ltr"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
                className="w-full border-b border-stone-400 bg-transparent pb-2 pe-8 text-base text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute inset-y-0 end-0 flex items-center text-stone-500 hover:text-stone-900"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mb-10 text-xs">
            <Link
              href="/forgot-password"
              className="text-stone-600 underline underline-offset-4 hover:text-stone-900"
            >
              نسيت كلمة المرور؟
            </Link>
          </div>

          {/* Submit — rectangular amber button, not a pill */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="group flex w-full items-center justify-center gap-3 border border-stone-900 bg-amber-300 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'جارٍ الدخول…' : 'دخول المحرّر'}
          </button>

          {/* Secondary link back to the main dashboards login */}
          <p className="mt-10 border-t border-stone-200 pt-6 text-center text-xs text-stone-500">
            للتاجر والمشرف،{' '}
            <Link
              href="/login"
              className="font-medium text-stone-800 underline underline-offset-4 hover:text-stone-900"
            >
              استخدم تسجيل الدخول الرئيسي
            </Link>
            .
          </p>
        </form>
      </main>
    </div>
  );
}
