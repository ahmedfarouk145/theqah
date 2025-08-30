// src/pages/connect/salla.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function ConnectSalla() {
  const { token } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [starting, setStarting] = useState<boolean>(true);

  useEffect(() => {
    if (!token) return; // منتظر التوكن من السياق
    const start = async () => {
      try {
        setStarting(true);
        setError("");

        const params = new URLSearchParams();
        // رجوع افتراضي بعد إتمام التفويض والكولباك
        params.set("return", "/admin");

        const res = await fetch(`/api/salla/connect?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.message || `HTTP ${res.status}`);
        }

        const j = (await res.json()) as { url?: string };
        if (!j?.url) throw new Error("Missing authorize URL");

        // التحويل لصفحة موافقة سلة
        window.location.href = j.url;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStarting(false);
      }
    };
    start();
  }, [token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
      <div className="bg-white rounded-3xl border border-gray-200/60 p-10 shadow-2xl w-full max-w-lg text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white text-3xl">
          {starting ? "⏳" : error ? "⚠️" : "✅"}
        </div>

        {starting && !error && (
          <>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">بدء ربط سلة</h1>
            <p className="text-gray-600">
              جارٍ تحويلك إلى صفحة التفويض في سلة لإتمام الربط الآمن…
            </p>
          </>
        )}

        {error && (
          <>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-3">تعذّر بدء الربط</h1>
            <p className="text-rose-600 font-semibold mb-6">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => router.reload()}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold shadow-lg hover:shadow-xl"
              >
                إعادة المحاولة
              </button>

              {/* استخدم Link بدل <a> */}
              <Link
                href="/connect"
                className="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50"
              >
                العودة
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
