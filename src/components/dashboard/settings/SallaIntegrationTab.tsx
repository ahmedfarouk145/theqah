// src/components/dashboard/settings/SallaIntegrationTab.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Info } from 'lucide-react';

type Props = { storeUid?: string };

type SallaStatus = {
  ok?: boolean;
  connected: boolean;
  uid?: string | null;
  storeId?: string | number | null;
  storeName?: string | null;
  domain?: string | null;
  apiBase?: string | null;
  reason?: string | null;
};

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
//eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null }> {
  const r = await fetch(url, init);
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  let j: any = null;
  try { j = await r.json(); } catch { j = null; }
  const data = (j && (j.data ?? j)) as T | null;
  return { ok: r.ok, data };
}

function asMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

export default function SallaIntegrationTab({ storeUid: storeUidProp }: Props) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SallaStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const resolvedUid = useMemo(() => {
    if (storeUidProp) return storeUidProp;
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      const q = u.searchParams.get('uid');
      if (q) return q;
    }
    return getCookie('salla_store_uid') || undefined;
  }, [storeUidProp]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const url = resolvedUid ? `/api/salla/status?uid=${encodeURIComponent(resolvedUid)}` : `/api/salla/status`;
        const { data } = await fetchJson<SallaStatus>(url);
        if (!mounted) return;
        setStatus(
          data || {
            ok: true,
            connected: false,
            reason: 'no_data',
          }
        );
      } catch (e) {
        if (mounted) setMsg(asMsg(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [resolvedUid]);

  const badge = useMemo(() => {
    const c = status?.connected;
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
  }, [status?.connected]);

  const storeId = useMemo(() => {
    const uid = status?.uid || resolvedUid || '';
    const m = String(uid).match(/^salla:(\d+)$/);
    return m ? m[1] : '';
  }, [status?.uid, resolvedUid]);

  const snippet = useMemo(() => {
    const ds = storeId ? `salla:${storeId}` : 'salla:{STORE_ID}';
    return `<!-- Theqah Reviews Widget (Salla) -->
<div id="theqah-reviews"
     class="theqah-reviews"
     data-store="${ds}"
     data-product=""
     data-limit="10"
     data-lang="ar"
     data-theme="light"></div>

<script>(function(){
  var m = (location.pathname||"").match(/\\/p(\\d+)(?:\\/|$)/);
  var pid = m ? m[1] : "";
  var host = document.querySelector('#theqah-reviews.theqah-reviews');
  if (host && pid) host.setAttribute('data-product', pid);
  var already = document.querySelector('script[data-theqah-widget]');
  if (already) return;
  var s = document.createElement('script');
  s.src = 'https://www.theqah.com.sa/widgets/theqah-widget.js';
  s.async = true;
  s.setAttribute('data-theqah-widget','1');
  document.body.appendChild(s);
})();</script>
<!-- /Theqah Reviews Widget -->`;
  }, [storeId]);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setMsg('تم النسخ ✅');
      setTimeout(() => setMsg(null), 1500);
    } catch {
      setMsg('تعذَّر النسخ. انسخه يدويًا.');
      setTimeout(() => setMsg(null), 2000);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">جارٍ التحميل…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold text-gray-900">حالة الربط</h4>
          {badge}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Info size={16} />
          معلومات المتجر
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">اسم المتجر</dt>
            <dd className="text-base font-semibold text-gray-900">
              {status?.storeName || 'غير محدد'}
            </dd>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">Store UID</dt>
            <dd className="text-base font-mono text-gray-900 break-all">
              {status?.uid || resolvedUid || '—'}
            </dd>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">Store ID (Salla)</dt>
            <dd className="text-base font-semibold text-gray-900">
              {storeId || '—'}
            </dd>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500 mb-1">النطاق</dt>
            <dd className="text-base font-semibold text-gray-900">
              {status?.domain || '—'}
            </dd>
          </div>
        </div>

        {status?.reason && (
          <div className="mt-3 text-xs text-gray-500">
            <span className="font-medium">المصدر:</span> {status.reason}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-base font-semibold text-gray-900 mb-4">تركيب ودجت المراجعات</h4>
        <p className="text-sm text-gray-600 mb-3">
          انسخ الكود التالي وضعه من لوحة تحكم سلة → <b>المظهر</b> → <b>تخصيص</b> → <b>إضافة كود HTML (قبل &lt;/body&gt;)</b>.
        </p>
        <pre className="bg-gray-50 border rounded-lg p-3 overflow-auto text-xs whitespace-pre">{snippet}</pre>
        <button
          onClick={copySnippet}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Copy size={16} />
          نسخ الكود
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-xl p-3 border ${
            msg.includes('✅')
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
