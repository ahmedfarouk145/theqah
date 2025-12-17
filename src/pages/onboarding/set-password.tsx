import { useRouter } from "next/router";
import { useState, useMemo } from "react";
import Head from "next/head";
import { auth } from "@/lib/firebase";
import {
  setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signInWithCustomToken
} from "firebase/auth";

export default function SetPasswordPage() {
  const router = useRouter();
  const tokenFromQuery = useMemo(
    () => (typeof router.query.t === "string" ? router.query.t : ""),
    [router.query.t]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenFromQuery) { setErr("Token مفقود في الرابط."); return; }
    setErr(null); setSubmitting(true);

    try {
      const r = await fetch("/api/auth/exchange-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: tokenFromQuery, password, email: email || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "فشل في الاستبدال");

      await setPersistence(auth, browserLocalPersistence);
      if (email) await signInWithEmailAndPassword(auth, email, password);
      else if (j.customToken) await signInWithCustomToken(auth, j.customToken);

      const dest = `/dashboard/integrations?salla=connected${j.storeUid ? `&uid=${encodeURIComponent(j.storeUid)}` : ""}`;
      router.replace(dest);
      //eslint-disable-next-line
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>تعيين كلمة المرور</title></Head>
      <main className="min-h-screen flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 border rounded-xl p-6">
          <h1 className="text-2xl font-semibold">إنشاء/تعيين كلمة المرور</h1>
          {!tokenFromQuery && <p className="text-red-600">Token مفقود في الرابط.</p>}

          <label htmlFor="onboarding-email" className="block">
            <span className="block text-sm mb-1">الإيميل (اختياري — يُفضّل تعبئته)</span>
            <input 
              id="onboarding-email"
              type="email" 
              className="w-full border rounded-md p-2"
              placeholder="you@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)} 
              autoComplete="email"
              aria-label="البريد الإلكتروني"
            />
          </label>

          <label htmlFor="onboarding-password" className="block">
            <span className="block text-sm mb-1">كلمة المرور</span>
            <input 
              id="onboarding-password"
              type="password" 
              className="w-full border rounded-md p-2"
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" 
              minLength={6} 
              required 
              aria-label="كلمة المرور"
              aria-required="true"
            />
          </label>

          {err && <p className="text-red-600 text-sm" role="alert" aria-live="polite">{err}</p>}

          <button 
            type="submit" 
            disabled={!tokenFromQuery || submitting}
            className="w-full rounded-md bg-black text-white py-2 disabled:opacity-60"
            aria-label="حفظ كلمة المرور والمتابعة"
          >
            {submitting ? "جاري الحفظ..." : "حفظ ومتابعة"}
          </button>
        </form>
      </main>
    </>
  );
}
