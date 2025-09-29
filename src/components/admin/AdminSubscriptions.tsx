// src/components/admin/AdminSubscriptions.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type PlanId = 'TRIAL' | 'P30' | 'P60' | 'P120' | 'ELITE' | string;

type ApiStoreItem = {
  storeUid: string;
  domainBase?: string;
  planId?: PlanId;
  invitesUsed?: number;
  invitesLimit?: number | null; // null = غير محدود
  status: 'active' | 'over_quota' | 'trial' | 'lapsed' | 'no_plan';
  sallaInstalled?: boolean;
  sallaConnected?: boolean;
  lastUpdate?: number;
};

// الاستجابة قد تكون { items: ApiStoreItem[] } أو { stores: ApiStoreItem[] }
type ApiResponse =
  | { ok: true; items: ApiStoreItem[] }
  | { ok: true; stores: ApiStoreItem[] }
  | { ok: false; error: string };

function StatusBadge({ s }: { s: ApiStoreItem['status'] }) {
  const map: Record<ApiStoreItem['status'], string> = {
    active: 'bg-green-100 text-green-800',
    over_quota: 'bg-amber-100 text-amber-800',
    trial: 'bg-blue-100 text-blue-800',
    lapsed: 'bg-red-100 text-red-800',
    no_plan: 'bg-gray-100 text-gray-800',
  };
  const label: Record<ApiStoreItem['status'], string> = {
    active: 'نشط',
    over_quota: 'تجاوز الحد',
    trial: 'تجربة',
    lapsed: 'غير مجدِّد',
    no_plan: 'بدون باقة',
  };
  return <Badge className={`${map[s]} rounded-full px-3 py-1`}>{label[s]}</Badge>;
}

export default function AdminSubscriptions() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ApiStoreItem[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Authorization بيتضاف تلقائيًّا من axiosInstance عبر Firebase ID token
        const { data } = await axios.get<ApiResponse>('/api/admin/subscriptions');
        if (!mounted) return;

        const list =
          (data as { items?: ApiStoreItem[] }).items ??
          (data as { stores?: ApiStoreItem[] }).stores ??
          [];

        setRows(list);
      } catch (e) {
        console.error('subscriptions_load_failed', e);
        setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.storeUid, r.domainBase, r.planId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  // “مشترك” = active | over_quota | trial
  const subscribed = filtered.filter((r) =>
    ['active', 'over_quota', 'trial'].includes(r.status),
  );
  // “غير مجدّد/غير مشترك” = lapsed | no_plan
  const notRenewed = filtered.filter((r) => ['lapsed', 'no_plan'].includes(r.status));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">إدارة الاشتراكات</h2>
        <Input
          placeholder="ابحث بالمتجر / الدومين / الباقة…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">المتاجر المشتركة</h3>
              <Badge className="rounded-full">{subscribed.length}</Badge>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-right p-2">المتجر</th>
                    <th className="text-right p-2">الدومين</th>
                    <th className="text-right p-2">الباقة</th>
                    <th className="text-right p-2">الاستهلاك</th>
                    <th className="text-right p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-500">
                        جاري التحميل…
                      </td>
                    </tr>
                  ) : subscribed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-500">
                        لا توجد نتائج.
                      </td>
                    </tr>
                  ) : (
                    subscribed.map((r) => (
                      <tr key={r.storeUid} className="border-b last:border-none">
                        <td className="p-2 font-medium">{r.storeUid}</td>
                        <td className="p-2">{r.domainBase || '-'}</td>
                        <td className="p-2">{r.planId || '—'}</td>
                        <td className="p-2">
                          {r.invitesLimit === null
                            ? `${r.invitesUsed ?? 0} / ∞`
                            : `${r.invitesUsed ?? 0} / ${r.invitesLimit ?? 0}`}
                        </td>
                        <td className="p-2">
                          <StatusBadge s={r.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">غير المُجدِّدين / بدون باقة</h3>
              <Badge className="rounded-full">{notRenewed.length}</Badge>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-right p-2">المتجر</th>
                    <th className="text-right p-2">الدومين</th>
                    <th className="text-right p-2">الباقة</th>
                    <th className="text-right p-2">الاستهلاك</th>
                    <th className="text-right p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-500">
                        جاري التحميل…
                      </td>
                    </tr>
                  ) : notRenewed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-500">
                        لا توجد نتائج.
                      </td>
                    </tr>
                  ) : (
                    notRenewed.map((r) => (
                      <tr key={r.storeUid} className="border-b last:border-none">
                        <td className="p-2 font-medium">{r.storeUid}</td>
                        <td className="p-2">{r.domainBase || '-'}</td>
                        <td className="p-2">{r.planId || '—'}</td>
                        <td className="p-2">
                          {r.invitesLimit === null
                            ? `${r.invitesUsed ?? 0} / ∞`
                            : `${r.invitesUsed ?? 0} / ${r.invitesLimit ?? 0}`}
                        </td>
                        <td className="p-2">
                          <StatusBadge s={r.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-gray-500">
        * حدود الدعوات لكل باقة معرفة في الخادم (TRIAL=5, P30=40, P60=90, P120=200, ELITE=∞).
      </p>
    </div>
  );
}
