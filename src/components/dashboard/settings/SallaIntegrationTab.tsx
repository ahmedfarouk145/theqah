// src/components/dashboard/settings/SallaIntegrationTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { app } from "@/lib/firebase";
import { Store, Link2, Link2Off, Save, AlertCircle, Check, Info } from "lucide-react";

type SallaStatus = {
  connected: boolean;
  storeName?: string | null;
  merchantId?: string | number | null;
  updatedAt?: number | null;
  apiBase?: string | null;
  reviewTemplate?: string;
  uid?: string | null;
  domain?: string | null;
  reason?: string | null;
};

const DEFAULT_TEMPLATE =
  "مرحباً [العميل]، قيم تجربتك من [المتجر]:: [الرابط] وساهم في إسعاد يتيم!";

function asMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j };
}

export default function SallaIntegrationTab() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<SallaStatus | null>(null);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [msg, setMsg] = useState<string | null>(null);

  const badge = useMemo(() => data?.connected ? (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
      <Check size={14}/> متصل
    </div>
  ) : (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
      <AlertCircle size={14}/> غير متصل
    </div>
  ), [data?.connected]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const auth = getAuth(app);
        const user = auth.currentUser;
        // استنى لحد ما Firebase يحسم الحالة
        if (!user) {
          // هنستنى event onAuthStateChanged في الصفحة الأساسية
          setData({ connected: false, reason: "no_user" });
          return;
        }
        const idToken = await user.getIdToken(true);
        const authInit = { headers: { Authorization: `Bearer ${idToken}` } };

        // 1) هات معلومات المتجر (alias)
        const info = await fetchJson("/api/store/info", authInit);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = (info as any)?.store || {};
        const storeUid: string | undefined =
          store.storeUid || (store.salla?.storeId ? `salla:${store.salla.storeId}` : undefined);

        // 2) اقرأ حالة سلة من stores مباشرة لو قدرنا نكوّن uid
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        let statusPayload: any = null;
        if (storeUid) {
          statusPayload = await fetchJson(`/api/salla/status?uid=${encodeURIComponent(storeUid)}`);
        } else {
          statusPayload = await fetchJson("/api/salla/status", authInit);
        }

        const raw = (statusPayload?.data ?? statusPayload) || {};
        const s: SallaStatus = {
          connected: Boolean(raw.connected),
          storeName: raw.storeName ?? store?.storeName ?? store?.name ?? null,
          merchantId: raw.storeId ?? store?.salla?.storeId ?? null,
          updatedAt: raw.updatedAt ?? null,
          apiBase: raw.apiBase ?? store?.salla?.apiBase ?? null,
          uid: raw.uid ?? storeUid ?? null,
          domain: raw.domain ?? store?.salla?.domain ?? null,
          reason: raw.reason ?? (storeUid ? "read_by_uid" : "auth_read"),
        };
        if (mounted) setData(s);

        // 3) اختياري: هات قالب الرسالة
        try {
          const st = await fetchJson("/api/store/settings?salla=1", authInit);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tpl = (st as any)?.settings?.salla?.reviewTemplate ?? (st as any)?.salla?.reviewTemplate ?? null;
          if (mounted && typeof tpl === "string" && tpl.trim()) setTemplate(tpl);
        } catch { /* ignore */ }
      } catch (e) {
        if (mounted) setMsg(`تعذّر تحميل الحالة: ${asMsg(e)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function connect() {
    setBusy(true); setMsg(null);
    try {
      const auth = getAuth(app);
      const idToken = await auth.currentUser?.getIdToken(true);
      const r = await fetch("/api/salla/connect", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const j = await r.json().catch(() => ({}));
      if (j?.ok && j?.url) location.href = j.url;
      else setMsg(j?.error || "تعذّر بدء الاتصال.");
    } catch (e) { setMsg(asMsg(e)); } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm("هل تريد فصل سلة؟")) return;
    setBusy(true); setMsg(null);
    try {
      const auth = getAuth(app);
      const idToken = await auth.currentUser?.getIdToken(true);
      const r = await fetch("/api/salla/disconnect", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) { setData((d)=> d ? { ...d, connected:false } : d); setMsg("تم الفصل بنجاح."); }
      else setMsg(j?.error || "تعذّر الفصل.");
    } catch (e) { setMsg(asMsg(e)); } finally { setBusy(false); }
  }

  async function saveTemplate() {
    setBusy(true); setMsg(null);
    try {
      const auth = getAuth(app);
      const idToken = await auth.currentUser?.getIdToken(true);
      const r = await fetch("/api/store/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ settings: { salla: { reviewTemplate: template } } }),
      });
      const ok = r.ok;
      if (!ok) throw new Error("تعذّر الحفظ.");
      setMsg("تم الحفظ ✅");
    } catch (e) { setMsg(asMsg(e)); } finally { setBusy(false); }
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">...تحميل</div>;

  return (
    <div className="space-y-6">
      {/* معلومات + أزرار + محرر القالب (نفس تصميمك) */}
      {/* ... احفظ تصميمك الحالي وضع دوال connect/disconnect/saveTemplate */}
    </div>
  );
}
