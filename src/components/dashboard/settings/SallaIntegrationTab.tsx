import { useEffect, useState } from "react";

type SallaStatus = {
  connected: boolean;
  storeName?: string | null;
  merchantId?: string | null;
  updatedAt?: number | null;
  apiBase?: string | null;
  reviewTemplate?: string;
};

const DEFAULT_TEMPLATE =
  "مرحباً [العميل]، قيم تجربتك من [المتجر]:: [الرابط] وساهم في إسعاد يتيم!";

export default function SallaIntegrationTab() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<SallaStatus | null>(null);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // ✅ نقرأ حالة الربط من API مخصص
        const r = await fetch("/api/salla/status");
        const j = await r.json().catch(() => ({}));
        const s: SallaStatus = j?.data || { connected: false };
        setData(s);

        // (اختياري) لو سبق وخزّنت القالب في مستند إعدادات عام:
        // const r2 = await fetch("/api/store/settings?salla=1");
        // const j2 = await r2.json().catch(() => ({}));
        // if (j2?.salla?.reviewTemplate) setTemplate(j2.salla.reviewTemplate);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/salla/connect", { method: "POST" });
      const j = await r.json();
      if (j?.ok && j?.url) location.href = j.url;
      else setMsg(j?.error || "تعذّر بدء الاتصال.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("هل تريد فصل سلة؟")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/salla/disconnect", { method: "POST" });
      const j = await r.json();
      if (j?.ok) {
        setData((d) => (d ? { ...d, connected: false } : d));
        setMsg("تم الفصل بنجاح.");
      } else setMsg(j?.error || "تعذّر الفصل.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/store/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salla: { reviewTemplate: template } }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok !== false) setMsg("تم الحفظ ✅");
      else setMsg(j?.error || "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">...تحميل</div>;
  const badge = data?.connected ? (
    <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs">متصل</span>
  ) : (
    <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-xs">غير متصل</span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">سلة (Salla)</h3>
        {badge}
      </div>

      <div className="text-sm text-gray-600">
        المتجر: <b>{data?.storeName || "—"}</b> | Merchant ID: <b>{data?.merchantId || "—"}</b>
      </div>

      <div className="flex gap-2">
        {!data?.connected ? (
          <button onClick={connect} disabled={busy} className="px-3 py-2 rounded-lg bg-black text-white">
            اتصال
          </button>
        ) : (
          <button onClick={disconnect} disabled={busy} className="px-3 py-2 rounded-lg bg-rose-600 text-white">
            فصل
          </button>
        )}
      </div>

      <div className="border rounded-lg p-3 space-y-2">
        <label className="text-sm">نص الرسالة</label>
        <textarea
          className="w-full min-h-[100px] rounded-lg border p-2"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <div className="text-xs text-gray-500">المتغيرات: [العميل] [المتجر] [الرابط]</div>
        <button onClick={saveTemplate} disabled={busy} className="px-3 py-2 rounded-lg bg-indigo-600 text-white">
          حفظ
        </button>
      </div>

      {msg && <div className="text-sm p-3 rounded-lg bg-gray-50 border">{msg}</div>}
    </div>
  );
}
