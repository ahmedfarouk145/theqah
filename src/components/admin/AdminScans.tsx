'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { Loader2, Mail, RefreshCw, Search } from 'lucide-react';

interface ScanRow {
  domain: string | null;
  url: string | null;
  email: string | null;
  hasEmail: boolean;
  isSubscriber: boolean;
  storeUid: string | null;
  score: number | null;
  ip: string | null;
  createdAt: number;
  failed: boolean;
}
interface ScansResponse {
  total: number;
  withEmail: number;
  subscribers: number;
  uniqueDomains: number;
  rows: ScanRow[];
}

const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AdminScans() {
  const [data, setData] = useState<ScansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyLeads, setOnlyLeads] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await axios.get<ScansResponse>('/api/admin/scans');
      setData(res.data);
    } catch (e) {
      setErr('تعذّر تحميل الفحوصات. تأكد من صلاحيات المشرف.');
      void e;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    if (onlyLeads) r = r.filter((x) => x.hasEmail);
    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter((x) =>
        [x.domain, x.email, x.storeUid].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)),
      );
    }
    return r;
  }, [data, q, onlyLeads]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }
  if (err) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{err}</p>
        <button onClick={() => void load()} className="px-4 py-2 rounded-md bg-green-600 text-white text-sm">إعادة المحاولة</button>
      </div>
    );
  }

  const stat = (label: string, value: number, color: string) => (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-green-800">الفحوصات والعملاء المحتملون</h2>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat('إجمالي الفحوصات', data?.total ?? 0, 'bg-gray-50 border-gray-200 text-gray-800')}
        {stat('تركوا إيميل (عملاء محتملون)', data?.withEmail ?? 0, 'bg-amber-50 border-amber-200 text-amber-800')}
        {stat('من متاجر مشتركة', data?.subscribers ?? 0, 'bg-green-50 border-green-200 text-green-800')}
        {stat('دومينات مختلفة', data?.uniqueDomains ?? 0, 'bg-blue-50 border-blue-200 text-blue-800')}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالدومين أو الإيميل…"
            className="w-full pr-9 pl-3 py-2 rounded-md border text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={onlyLeads} onChange={(e) => setOnlyLeads(e.target.checked)} />
          من تركوا إيميل فقط
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm text-right">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">الدومين</th>
              <th className="px-3 py-2 font-medium">الإيميل</th>
              <th className="px-3 py-2 font-medium">الحالة</th>
              <th className="px-3 py-2 font-medium">الدرجة</th>
              <th className="px-3 py-2 font-medium">IP</th>
              <th className="px-3 py-2 font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i} className={r.hasEmail ? 'bg-amber-50/40' : ''}>
                <td className="px-3 py-2">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{r.domain || r.url}</a>
                  ) : (r.domain || '—')}
                </td>
                <td className="px-3 py-2">
                  {r.email ? (
                    <span className="inline-flex items-center gap-1 text-amber-800 font-medium"><Mail className="w-3.5 h-3.5" />{r.email}</span>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  {r.failed ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">فشل</span>
                  ) : r.isSubscriber ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">مشترك</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">زائر</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.score ?? '—'}</td>
                <td className="px-3 py-2 text-gray-500 font-mono text-xs">{r.ip || '—'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">لا توجد نتائج</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
