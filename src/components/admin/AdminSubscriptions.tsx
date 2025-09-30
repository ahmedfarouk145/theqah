// src/components/admin/AdminSubscriptions.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from '@/lib/axiosInstance';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type PlanId = 'TRIAL' | 'P30' | 'P60' | 'P120' | 'ELITE' | string;

type ApiStoreItem = {
  storeUid: string;
  domainBase?: string;
  planId?: PlanId | null;
  invitesUsed?: number;
  invitesLimit?: number | null; // null = غير محدود
  status: 'active' | 'over_quota' | 'trial' | 'lapsed' | 'no_plan';
  sallaInstalled?: boolean;
  sallaConnected?: boolean;
  lastUpdate?: number;
};

type ApiGrouped = { all?: ApiStoreItem[] } & Record<string, ApiStoreItem[] | undefined>;
type ApiResponse =
  | { ok: true; items: ApiStoreItem[]; grouped?: ApiGrouped; count?: number; month?: string }
  | { ok: true; stores: ApiStoreItem[]; grouped?: ApiGrouped; count?: number; month?: string }
  | { ok: true; grouped: ApiGrouped; count?: number; month?: string }
  | { ok: false; error: string; message?: string };

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

const PLAN_LIMITS: Record<string, number | null> = {
  TRIAL: 5,
  P30: 40,
  P60: 90,
  P120: 200,
  ELITE: null, // ∞
};

export default function AdminSubscriptions() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ApiStoreItem[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApiStoreItem['status']>('all');
  const [planFilter, setPlanFilter] = useState<'ALL' | PlanId>('ALL');
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [reloading, setReloading] = useState(false);

  function extractList(data: ApiResponse): ApiStoreItem[] {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyData = data as any;
    const list: ApiStoreItem[] =
      anyData?.items ?? anyData?.stores ?? anyData?.grouped?.all ?? [];
    return Array.isArray(list) ? list : [];
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await axios.get<ApiResponse>('/api/admin/subscriptions');
      const list = extractList(data);
      setRows(list);
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error('subscriptions_load_failed', e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'load_failed';
      setErr(`تعذّر تحميل الاشتراكات: ${msg}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = [...rows];

    if (needle) {
      out = out.filter((r) =>
        [r.storeUid, r.domainBase, r.planId]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      );
    }

    if (statusFilter !== 'all') {
      out = out.filter((r) => r.status === statusFilter);
    }

    if (planFilter !== 'ALL') {
      out = out.filter((r) => (r.planId ?? '') === planFilter);
    }

    return out;
  }, [rows, q, statusFilter, planFilter]);

  const subscribed = filtered.filter((r) =>
    ['active', 'over_quota', 'trial'].includes(r.status),
  );
  const notRenewed = filtered.filter((r) => ['lapsed', 'no_plan'].includes(r.status));

  async function syncOne(storeUid: string) {
    setSyncing((m) => ({ ...m, [storeUid]: true }));
    try {
      await axios.get('/api/admin/subscription', {
        params: { storeUid, force: 1 },
      });
      // بعد المزامنة، أعد التحميل لضمان حساب الحالة من السيرفر
      await load();
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error('sync_failed', e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'sync_failed';
      alert(`فشل مزامنة المتجر ${storeUid}: ${msg}`);
    } finally {
      setSyncing((m) => ({ ...m, [storeUid]: false }));
    }
  }

  async function refreshAll() {
    setReloading(true);
    await load();
    setReloading(false);
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-2xl font-bold">إدارة الاشتراكات</h2>

        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <Input
            placeholder="ابحث بالمتجر / الدومين / الباقة…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="md:max-w-xs"
          />

          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={statusFilter}
            //eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="فلترة بالحالة"
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="over_quota">تجاوز الحد</option>
            <option value="trial">تجربة</option>
            <option value="lapsed">غير مجدِّد</option>
            <option value="no_plan">بدون باقة</option>
          </select>

          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={planFilter}
            //eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(e) => setPlanFilter(e.target.value as any)}
            aria-label="فلترة بالباقة"
          >
            <option value="ALL">كل الباقات</option>
            <option value="TRIAL">TRIAL</option>
            <option value="P30">P30</option>
            <option value="P60">P60</option>
            <option value="P120">P120</option>
            <option value="ELITE">ELITE</option>
          </select>

          <Button onClick={refreshAll} disabled={reloading}>
            {reloading ? 'جارٍ التحديث…' : 'تحديث'}
          </Button>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-700 p-3">
          {err}{' '}
          <button
            onClick={load}
            className="underline decoration-dotted hover:opacity-80 ml-2"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

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
                    <th className="text-right p-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">
                        جاري التحميل…
                      </td>
                    </tr>
                  ) : subscribed.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">
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
                            : `${r.invitesUsed ?? 0} / ${r.invitesLimit ?? PLAN_LIMITS[r.planId ?? ''] ?? 0}`}
                        </td>
                        <td className="p-2">
                          <StatusBadge s={r.status} />
                        </td>
                        <td className="p-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => syncOne(r.storeUid)}
                            disabled={!!syncing[r.storeUid]}
                          >
                            {syncing[r.storeUid] ? 'مزامنة…' : 'Sync'}
                          </Button>
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
                    <th className="text-right p-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">
                        جاري التحميل…
                      </td>
                    </tr>
                  ) : notRenewed.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">
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
                            : `${r.invitesUsed ?? 0} / ${r.invitesLimit ?? PLAN_LIMITS[r.planId ?? ''] ?? 0}`}
                        </td>
                        <td className="p-2">
                          <StatusBadge s={r.status} />
                        </td>
                        <td className="p-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => syncOne(r.storeUid)}
                            disabled={!!syncing[r.storeUid]}
                          >
                            {syncing[r.storeUid] ? 'مزامنة…' : 'Sync'}
                          </Button>
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
        * حدود الدعوات لكل باقة معرفة في الخادم (TRIAL=5, P30=40, P60=90, P120=200، ELITE بدون حد).
      </p>
    </div>
  );
}
