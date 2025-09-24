// src/components/dashboard/settings/SallaIntegrationTab.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Info, Zap, RefreshCw, Settings, ExternalLink } from 'lucide-react';

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
  merchantEmail?: string | null;
  installDate?: string | null;
  lastSync?: string | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<SallaStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    const fetchStatus = async () => {
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
    };
    
    fetchStatus();
    return () => { mounted = false; };
  }, [resolvedUid]);

  // دالة تحديث الحالة
  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      const url = resolvedUid ? `/api/salla/status?uid=${encodeURIComponent(resolvedUid)}` : `/api/salla/status`;
      const { data } = await fetchJson<SallaStatus>(url);
      setStatus(
        data || {
          ok: true,
          connected: false,
          reason: 'no_data',
        }
      );
      setMsg('تم تحديث الحالة ✅');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`خطأ في التحديث: ${asMsg(e)}`);
      setTimeout(() => setMsg(null), 3000);
    } finally {
      setRefreshing(false);
    }
  };

  const badge = useMemo(() => {
    const c = status?.connected;
    if (c) {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium shadow-sm">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <Check size={16} />
          <span>متصل بنجاح</span>
        </div>
      );
    } else {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium shadow-sm">
          <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
          <AlertCircle size={16} />
          <span>غير متصل</span>
        </div>
      );
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        <span className="mr-3 text-gray-600">جارٍ التحميل...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Zap className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-gray-900">تكامل سلة</h4>
            <p className="text-sm text-gray-600">إدارة ربط متجرك مع منصة سلة</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {badge}
          <button
            onClick={refreshStatus}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Info size={18} className="text-blue-600" />
            معلومات الاتصال
          </h4>
          {status?.connected && status?.domain && (
            <a
              href={`https://${status.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ExternalLink size={14} />
              زيارة المتجر
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <dt className="text-sm font-medium text-gray-500 mb-2">اسم المتجر</dt>
              <dd className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                {status?.storeName || 'غير محدد'}
                {status?.connected && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
              </dd>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <dt className="text-sm font-medium text-gray-500 mb-2">معرف المتجر (Store ID)</dt>
              <dd className="text-base font-mono text-gray-900 break-all">
                {storeId || '—'}
              </dd>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <dt className="text-sm font-medium text-gray-500 mb-2">النطاق</dt>
              <dd className="text-base font-semibold text-gray-900">
                {status?.domain ? (
                  <a href={`https://${status.domain}`} target="_blank" rel="noopener noreferrer" 
                     className="text-blue-600 hover:text-blue-800 transition-colors">
                    {status.domain}
                  </a>
                ) : '—'}
              </dd>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <dt className="text-sm font-medium text-gray-500 mb-2">Store UID</dt>
              <dd className="text-sm font-mono text-gray-600 break-all">
                {status?.uid || resolvedUid || '—'}
              </dd>
            </div>
          </div>
        </div>

        {/* Advanced Info Toggle */}
        {status?.connected && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <Settings size={16} />
              {showAdvanced ? 'إخفاء التفاصيل المتقدمة' : 'عرض التفاصيل المتقدمة'}
            </button>
            
            {showAdvanced && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {status?.merchantEmail && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <dt className="text-xs font-medium text-blue-600 mb-1">إيميل التاجر</dt>
                    <dd className="text-sm text-blue-800">{status.merchantEmail}</dd>
                  </div>
                )}
                {status?.installDate && (
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <dt className="text-xs font-medium text-green-600 mb-1">تاريخ التثبيت</dt>
                    <dd className="text-sm text-green-800">{new Date(status.installDate).toLocaleDateString('ar-SA')}</dd>
                  </div>
                )}
                {status?.reason && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <dt className="text-xs font-medium text-gray-600 mb-1">مصدر البيانات</dt>
                    <dd className="text-sm text-gray-800">{status.reason}</dd>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Easy OAuth Explanation */}
      {!status?.connected && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
          <h4 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Zap className="text-blue-600" size={20} />
            كيفية ربط متجرك بسلة (النمط السهل)
          </h4>
          <div className="prose prose-blue max-w-none text-sm text-blue-800">
            <ol className="space-y-2">
              <li>انتقل إلى <strong>متجر سلة للتطبيقات</strong> وابحث عن تطبيق "ثقة"</li>
              <li>اضغط على <strong>"تثبيت التطبيق"</strong></li>
              <li>ستتم عملية الربط تلقائياً باستخدام النمط السهل (Easy OAuth)</li>
              <li>ستصلك رسالة إيميل تحتوي على تفاصيل حسابك</li>
              <li>بعد التثبيت، ستظهر معلومات متجرك هنا تلقائياً</li>
            </ol>
          </div>
          <div className="mt-4 p-3 bg-blue-100 rounded-lg">
            <p className="text-xs text-blue-700">
              💡 <strong>نصيحة:</strong> النمط السهل يتيح لك ربط متجرك دون الحاجة لخطوات معقدة. ستحصل على جميع الصلاحيات المطلوبة تلقائياً.
            </p>
          </div>
        </div>
      )}

      {/* Widget Installation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Copy className="text-purple-600" size={18} />
          تركيب ودجت التقييمات
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          انسخ الكود التالي وضعه في لوحة تحكم سلة → <strong>المظهر</strong> → <strong>تخصيص</strong> → <strong>إضافة كود HTML (قبل &lt;/body&gt;)</strong>
        </p>
        
        <div className="relative">
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-auto text-xs leading-relaxed font-mono max-h-80">
            {snippet}
          </pre>
          <button
            onClick={copySnippet}
            className="absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-md transition-colors"
          >
            <Copy size={14} />
            نسخ
          </button>
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h5 className="text-sm font-semibold text-yellow-800 mb-2">📋 خطوات التركيب:</h5>
          <ol className="text-xs text-yellow-700 space-y-1 mr-4">
            <li>1. انسخ الكود أعلاه</li>
            <li>2. اذهب إلى لوحة تحكم سلة</li>
            <li>3. المظهر → تخصيص → إضافة كود HTML</li>
            <li>4. الصق الكود في المكان المخصص &ldquo;قبل &lt;/body&gt;&rdquo;</li>
            <li>5. احفظ التغييرات</li>
          </ol>
        </div>
      </div>

      {/* Status Messages */}
      {msg && (
        <div
          className={`rounded-xl p-4 border transition-all duration-300 ${
            msg.includes('✅')
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : msg.includes('خطأ')
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.includes('✅') ? (
              <Check size={16} />
            ) : msg.includes('خطأ') ? (
              <AlertCircle size={16} />
            ) : (
              <Info size={16} />
            )}
            <span className="font-medium">{msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
