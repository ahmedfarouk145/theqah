// src/components/admin/tabs/TestNotifyTab.tsx
import { useMemo, useState } from 'react';

type ChannelName = 'sms' | 'whatsapp' | 'email';

type Attempt = {
  channel: ChannelName;
  ok: boolean;
  id?: string | null;
  error?: string | null;
};

type ApiResult = {
  ok: boolean;
  firstSuccessChannel: ChannelName | null;
  attempts: Attempt[];
  text?: string;
  segments?: number;
  encoding?: 'GSM-7' | 'UCS-2';
  error?: string;
};

export default function TestNotifyTab() {
  const [to, setTo] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [storeName, setStoreName] = useState('متجر ثقة');
  const [customerName, setCustomerName] = useState('عميل');
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');

  // تفعيل/تعطيل القنوات
  const [orderState, setOrderState] = useState({ sms: true, whatsapp: true, email: true });
  const orderArray = useMemo(
    () => (['sms', 'whatsapp', 'email'] as const).filter((c) => orderState[c]),
    [orderState]
  );

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/test-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // جلسة فقط (كوكيز)
        body: JSON.stringify({
          to,
          email: email || undefined,
          locale,
          url,
          storeName,
          customerName,
          order: orderArray, // مثال: ["sms","whatsapp","email"]
        }),
      });
      const j = (await res.json()) as ApiResult;
      if (!res.ok) throw new Error(j?.error || 'Request failed');
      setResult(j);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="p-4 space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">اختبار قنوات الإرسال</h2>
        <p className="text-sm text-muted-foreground">
          يجرّب الإرسال بالتسلسل (SMS ← WhatsApp ← Email) ويُكمّل على كل القنوات حتى لو قناة نجحت.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-center bg-white dark:bg-neutral-900 border rounded-2xl p-4">
        <label className="text-sm">رقم الجوال</label>
        <input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="+9665XXXXXXXX" />

        <label className="text-sm">البريد (اختياري)</label>
        <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />

        <label className="text-sm">الرابط المختصر</label>
        <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tq.sa/r/AbCd" />

        <label className="text-sm">اسم المتجر</label>
        <input className={inputCls} value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="متجر ثقة" />

        <label className="text-sm">اسم العميل</label>
        <input className={inputCls} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="عميل" />

        <label className="text-sm">اللغة</label>
        <select className={inputCls} value={locale} onChange={(e) => setLocale(e.target.value as 'ar' | 'en')}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>

        <label className="text-sm">ترتيب/تفعيل القنوات</label>
        <div className="text-sm">
          <label className="inline-flex items-center gap-2 me-4">
            <input
              type="checkbox"
              checked={orderState.sms}
              onChange={(e) => setOrderState((s) => ({ ...s, sms: e.target.checked }))}
            />
            SMS
          </label>
          <label className="inline-flex items-center gap-2 me-4">
            <input
              type="checkbox"
              checked={orderState.whatsapp}
              onChange={(e) => setOrderState((s) => ({ ...s, whatsapp: e.target.checked }))}
            />
            WhatsApp
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={orderState.email}
              onChange={(e) => setOrderState((s) => ({ ...s, email: e.target.checked }))}
            />
            Email
          </label>
          <div className="text-xs text-muted-foreground mt-1">
            الترتيب ثابت: SMS ثم WhatsApp ثم Email — يتم تخطّي القناة غير المفعّلة تلقائيًا.
          </div>
        </div>
      </section>

      <div>
        <button
          onClick={run}
          disabled={loading}
          className="px-4 py-2 rounded-xl border bg-black text-white disabled:bg-neutral-500"
        >
          {loading ? 'جاري الاختبار…' : 'إرسال اختبار'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">خطأ: {String(error)}</p>}

      {result && (
        <section className="space-y-3">
          <div className="bg-white dark:bg-neutral-900 border rounded-2xl p-4">
            <h3 className="font-medium mb-2">النتيجة</h3>
            <p>أول قناة نجحت: <b>{result.firstSuccessChannel || 'لا شيء'}</b></p>
            {result.text && <p className="mt-2">النص المُرسل: {result.text}</p>}
            {result.segments && (
              <p className="text-sm text-muted-foreground">تقدير الشرائح: {result.segments} ({result.encoding})</p>
            )}
          </div>

          <div className="bg-white dark:bg-neutral-900 border rounded-2xl p-4">
            <h4 className="font-medium mb-3">تفاصيل المحاولات</h4>
            <div className="grid gap-3">
              {(result.attempts || []).map((a: Attempt, idx: number) => (
                <div
                  key={idx}
                  className={`border rounded-xl p-3 ${a.ok ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}
                >
                  <div><b>القناة:</b> {a.channel}</div>
                  <div><b>الحالة:</b> {a.ok ? 'نجاح ✅' : 'فشل ❌'}</div>
                  {a.id != null && <div><b>معرّف الرسالة:</b> {String(a.id)}</div>}
                  {a.error && <div className="text-rose-600"><b>خطأ:</b> {a.error}</div>}
                </div>
              ))}
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer">الاستجابة كاملة (JSON)</summary>
              <pre className="bg-[#0b1220] text-[#9efb76] p-3 rounded-xl overflow-auto text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        </section>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-700';
