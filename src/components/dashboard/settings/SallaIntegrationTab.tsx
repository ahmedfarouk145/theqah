import { useEffect, useMemo, useState } from "react";
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

function asMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

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

  // تبسيط عرض الشارة
  const badge = useMemo(() => {
    const c = data?.connected;
    return c ? (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
        <Check size={14} />
        متصل
      </div>
    ) : (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
        <AlertCircle size={14} />
        غير متصل
      </div>
    );
  }, [data?.connected]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // 1) هات معلومات المتجر لبناء uid = salla:{STORE_ID}
        //    الشكل المتوقع: { store: { storeUid?: "salla:123", salla?: { storeId }, name } }
        const info = await fetchJson("/api/store/info");
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = (info as any)?.store || {};
        const storeUid: string | undefined =
          store.storeUid ||
          (store.salla?.storeId ? `salla:${store.salla.storeId}` : undefined);

        // 2) لو قدرنا نكوّن uid → نقرأ الحالة مباشرة بالـ uid (أدق طريق)
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        let statusPayload: any = null;
        if (storeUid) {
          const st = await fetchJson(`/api/salla/status?uid=${encodeURIComponent(storeUid)}`);
          statusPayload = st;
        } else {
          // 3) fallback قديم (لو ماقدرناش نجيب uid)
          const st = await fetchJson("/api/salla/status");
          statusPayload = st;
        }

        // 4) دعم أشكال مختلفة للـ response:
        //    أ/ جديد: { ok, connected, uid, storeId, storeName, domain, reason }
        //    ب/ قديم: { data: { connected, storeName, merchantId, ... } }
        const raw = (statusPayload?.data ?? statusPayload) || {};
        const connected: boolean = Boolean(
          typeof raw.connected === "boolean" ? raw.connected : false
        );
        const normalized: SallaStatus = {
          connected,
          storeName: raw.storeName ?? store?.name ?? null,
          merchantId: raw.storeId ?? raw.merchantId ?? store?.salla?.storeId ?? null,
          updatedAt: raw.updatedAt ?? null,
          apiBase: raw.apiBase ?? store?.salla?.apiBase ?? null,
          reviewTemplate: raw.reviewTemplate ?? undefined,
          uid: raw.uid ?? storeUid ?? null,
          domain: raw.domain ?? store?.salla?.domain ?? null,
          reason: raw.reason ?? null,
        };

        if (mounted) setData(normalized);

        // 5) (اختياري) حاول تجيب قالب الرسالة المخزّن لو عندك API
        try {
          const st = await fetchJson("/api/store/settings?salla=1");
          const tpl =
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
            (st as any)?.settings?.salla?.reviewTemplate ??
            //eslint-disable-next-line @typescript-eslint/no-explicit-any
            (st as any)?.salla?.reviewTemplate ??
            null;
          if (mounted && typeof tpl === "string" && tpl.trim()) {
            setTemplate(tpl);
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (mounted) setMsg(`تعذّر تحميل الحالة: ${asMsg(e)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/salla/connect", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok && j?.url) {
        location.href = j.url; // نكمّل فلو OAuth
      } else {
        setMsg(j?.error || "تعذّر بدء الاتصال.");
      }
    } catch (e) {
      setMsg(asMsg(e));
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
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        setData((d) => (d ? { ...d, connected: false } : d));
        setMsg("تم الفصل بنجاح.");
      } else {
        setMsg(j?.error || "تعذّر الفصل.");
      }
    } catch (e) {
      setMsg(asMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    setBusy(true);
    setMsg(null);
    try {
      // ندعم شكلي الpayload حسب الـ API عندك
      const bodyA = { settings: { salla: { reviewTemplate: template } } };
      const r = await fetch("/api/store/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyA),
      });
      let ok = r.ok;
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      let j: any = {};
      try {
        j = await r.json();
        ok = ok && j?.ok !== false;
      } catch {
        /* ignore */
      }
      if (!ok) {
        // fallback للشكل القديم
        const r2 = await fetch("/api/store/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ salla: { reviewTemplate: template } }),
        });
        const j2 = await r2.json().catch(() => ({}));
        if (!r2.ok || j2?.ok === false) throw new Error(j2?.error || "تعذّر الحفظ.");
      }
      setMsg("تم الحفظ ✅");
    } catch (e) {
      setMsg(asMsg(e));
    } finally {
      setBusy(false);
    }
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
      {/* Header Card */}
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

      {/* Store Information Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Info size={16} />
          معلومات المتجر
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">اسم المتجر</dt>
            <dd className="text-base font-semibold text-gray-900">
              {data?.storeName || "غير محدد"}
            </dd>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">معرف التاجر</dt>
            <dd className="text-base font-semibold text-gray-900">
              {data?.merchantId != null ? String(data.merchantId) : "غير محدد"}
            </dd>
          </div>
        </div>

        {/* Additional Info */}
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

      {/* Connection Actions Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4">إدارة الاتصال</h4>
        
        <div className="flex gap-3">
          {!data?.connected ? (
            <button
              onClick={connect}
              disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-medium rounded-lg shadow-sm hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Link2 size={16} />
              {busy ? "جارٍ الاتصال..." : "اتصال"}
            </button>
          ) : (
            <button
              onClick={disconnect}
              disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-rose-700 text-white font-medium rounded-lg shadow-sm hover:from-rose-700 hover:to-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Link2Off size={16} />
              {busy ? "جارٍ الفصل..." : "فصل"}
            </button>
          )}
        </div>
      </div>

      {/* Template Editor Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4">قالب الرسائل</h4>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              نص الرسالة
            </label>
            <textarea
              className="w-full min-h-[120px] px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 placeholder-gray-400 resize-none"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="أدخل نص الرسالة هنا..."
            />
            <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 font-medium mb-1">المتغيرات المتاحة:</p>
              <div className="flex flex-wrap gap-2">
                <code className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">[العميل]</code>
                <code className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">[المتجر]</code>
                <code className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">[الرابط]</code>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={saveTemplate}
              disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-medium rounded-lg shadow-sm hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Save size={16} />
              {busy ? "جارٍ الحفظ..." : "حفظ القالب"}
            </button>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {msg && (
        <div className={`rounded-xl p-4 border ${
          msg.includes("✅") || msg.includes("بنجاح")
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <div className="flex items-center gap-2">
            {msg.includes("✅") || msg.includes("بنجاح") ? (
              <Check size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="font-medium">{msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}