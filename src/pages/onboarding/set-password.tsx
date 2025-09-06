// src/pages/onboarding/set-password.tsx
import { useRouter } from "next/router";
import { useState } from "react";
import Head from "next/head";
// لو بتستخدم Firebase Client SDK:
import { getAuth, signInWithCustomToken } from "firebase/auth";

export default function SetPasswordPage() {
  const router = useRouter();
  const t = typeof router.query.t === "string" ? router.query.t : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/exchange-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: t, password, email: email || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error || j?.message || "Failed");

      // سجّل دخول بالـ Custom Token (Firebase)
      const auth = getAuth();
      await signInWithCustomToken(auth, j.customToken);

      // روح الداشبورد
      router.replace("/dashboard/integrations?salla=connected");
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>Set Password</title></Head>
      <main className="min-h-screen flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 border rounded-xl p-6">
          <h1 className="text-2xl font-semibold">إنشاء/تعيين كلمة المرور</h1>
          {!t && <p className="text-red-600">Token مفقود في الرابط.</p>}

          <label className="block">
            <span className="block text-sm mb-1">الإيميل (اختياري)</span>
            <input
              type="email"
              className="w-full border rounded-md p-2"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="block text-sm mb-1">كلمة المرور</span>
            <input
              type="password"
              className="w-full border rounded-md p-2"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          {err && <p className="text-red-600 text-sm">{err}</p>}

          <button
            type="submit"
            disabled={!t || submitting}
            className="w-full rounded-md bg-black text-white py-2 disabled:opacity-60"
          >
            {submitting ? "جاري الحفظ..." : "حفظ ومتابعة"}
          </button>
        </form>
      </main>
    </>
  );
}
