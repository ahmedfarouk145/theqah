import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { Store, Link2, Link2Off, Save, AlertCircle, Check, Info } from "lucide-react";

type SallaStatus = {
  connected: boolean;
  storeName?: string | null;
  merchantId?: string | number | null;
  uid?: string | null;
  domain?: string | null;
  reason?: string | null;
};

const DEFAULT_TEMPLATE = "مرحباً [العميل]، قيم تجربتك من [المتجر]:: [الرابط] وساهم في إسعاد يتيم!";

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j };
}

export default function SallaIntegrationTab() {
  const router = useRouter();
  const { store } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<SallaStatus | null>(null);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [msg, setMsg] = useState<string | null>(null);

  const badge = useMemo(() => {
    const c = data?.connected;
    return c ? (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
        <Check size={14} /> متصل
      </div>
    ) : (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
        <AlertCircle size={14} /> غير متصل
      </div>
    );
  }, [data?.connected]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const uidFromQuery = typeof router.query.uid === "string" ? router.query.uid : undefined;
        const preferUid = uidFromQuery || store.storeUid || undefined;

        const url = preferUid
          ? `/api/salla/status?uid=${encodeURIComponent(preferUid)}`
          : `/api/salla/status`; // (للتوافق) قديمًا كان ownerUid

        const st = await fetchJson(url);
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (st as any)?.data ?? st ?? {};
        const normalized: SallaStatus = {
          connected: Boolean(raw.connected),
          storeName: raw.storeName ?? store.storeName ?? null,
          merchantId: raw.storeId ?? null,
          uid: raw.uid ?? preferUid ?? null,
          domain: raw.domain ?? null,
          reason: raw.reason ?? null,
        };
        if (mounted) setData(normalized);
      } catch (e) {
        if (mounted) setMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.uid, store.storeUid]);

  async function connect() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/salla/connect", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok && j?.url) location.href = j.url;
      else setMsg(j?.error || "تعذّر بدء الاتصال.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm("هل تريد فصل سلة؟")) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/salla/disconnect", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        setData((d) => (d ? { ...d, connected: false } : d));
        setMsg("تم الفصل بنجاح.");
      } else setMsg(j?.error || "تعذّر الفصل.");
    } finally { setBusy(false); }
  }

  async function saveTemplate() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/store/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salla: { reviewTemplate: template } }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok !== false) setMsg("تم الحفظ ✅");
      else setMsg(j?.error || "تعذّر الحفظ.");
    } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="mr-3 text-gray-600 font-medium">جارٍ التحميل...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">سلة (Salla)</h3>
              <p className="text-sm text-gray-500 mt-0.5">إدارة اتصال متجرك</p>
            </div>
          </div>
          {badge}
        </div>
      </div>

      {/* Store Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Info size={16} /> معلومات المتجر
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">اسم المتجر</dt>
            <dd className="text-base font-semibold text-gray-900">{data?.storeName || "غير محدد"}</dd>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">معرّف التاجر</dt>
            <dd className="text-base font-semibold text-gray-900">
              {data?.merchantId != null ? String(data.merchantId) : "غير محدد"}
            </dd>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {data?.uid && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              <span className="font-medium">المعرف الفريد:</span> {data.uid}
            </div>
          )}
          {data?.domain && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              <span className="font-medium">النطاق:</span> {data.domain}
            </div>
          )}
          {data?.reason && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-md px-3 py-2">
              <span className="font-medium">المصدر:</span> {data.reason}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4">إدارة الاتصال</h4>
        <div className="flex gap-3">
          {!data?.connected ? (
            <button onClick={connect} disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50">
              <Link2 size={16} /> {busy ? "جارٍ الاتصال..." : "اتصال"}
            </button>
          ) : (
            <button onClick={disconnect} disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-rose-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50">
              <Link2Off size={16} /> {busy ? "جارٍ الفصل..." : "فصل"}
            </button>
          )}
        </div>
      </div>

      {/* Template */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4">قالب الرسائل</h4>
        <div className="space-y-4">
          <textarea
            className="w-full min-h-[120px] px-4 py-3 rounded-lg border border-gray-300"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="أدخل نص الرسالة هنا..."
          />
          <div className="flex justify-end">
            <button onClick={saveTemplate} disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50">
              <Save size={16} /> {busy ? "جارٍ الحفظ..." : "حفظ القالب"}
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl p-4 border ${
          msg.includes("✅") || msg.includes("بنجاح")
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <div className="flex items-center gap-2">
            {msg.includes("✅") || msg.includes("بنجاح") ? <Check size={16} /> : <AlertCircle size={16} />}
            <span className="font-medium">{msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
