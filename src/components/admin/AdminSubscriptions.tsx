'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { PLANS, type PlanId } from '@/config/plans';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type SubscriptionBucket =
  | 'trial'
  | 'monthly'
  | 'yearly'
  | 'cancelled'
  | 'unknown';

type ApiStoreItem = {
  storeUid: string;
  storeName?: string;
  provider: string;
  domainBase?: string;
  planId?: string | null;
  planActive: boolean;
  bucket: SubscriptionBucket;
  invitesUsed: number;
  invitesLimit: number | null;
  startedAt: number | null;
  expiresAt: number | null;
  cancelledAt: number | null;
  connected: boolean;
  installed: boolean;
  canSync: boolean;
  lastUpdate?: number;
};

type ApiGrouped = {
  trial?: ApiStoreItem[];
  monthly?: ApiStoreItem[];
  yearly?: ApiStoreItem[];
  cancelled?: ApiStoreItem[];
  unknown?: ApiStoreItem[];
  all?: ApiStoreItem[];
};

type ApiResponse =
  | {
      ok: true;
      grouped: ApiGrouped;
      count: number;
      counts: {
        all: number;
        trial: number;
        monthly: number;
        yearly: number;
        cancelled: number;
        unknown: number;
      };
    }
  | {
      ok: false;
      error: string;
      message?: string;
    };

type VisibleBucket = Exclude<SubscriptionBucket, 'unknown'>;

const BUCKET_ORDER: VisibleBucket[] = [
  'trial',
  'monthly',
  'yearly',
  'cancelled',
];

const BUCKET_META: Record<
  VisibleBucket,
  {
    title: string;
    badgeClass: string;
    emptyLabel: string;
  }
> = {
  trial: {
    title: 'المتاجر التجريبية',
    badgeClass: 'bg-sky-100 text-sky-800',
    emptyLabel: 'لا توجد متاجر في الباقة التجريبية.',
  },
  monthly: {
    title: 'المتاجر الشهرية',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    emptyLabel: 'لا توجد متاجر باشتراك شهري.',
  },
  yearly: {
    title: 'المتاجر السنوية',
    badgeClass: 'bg-violet-100 text-violet-800',
    emptyLabel: 'لا توجد متاجر باشتراك سنوي.',
  },
  cancelled: {
    title: 'المتاجر الملغية',
    badgeClass: 'bg-rose-100 text-rose-800',
    emptyLabel: 'لا توجد متاجر ملغية أو منتهية.',
  },
};

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const response = (
      error as {
        response?: {
          data?: {
            error?: string;
            message?: string;
          };
        };
      }
    ).response;

    if (response?.data?.message) {
      return response.data.message;
    }

    if (response?.data?.error) {
      return response.data.error;
    }

    const message = (error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  return 'load_failed';
}

function formatPlanLabel(planId?: string | null, bucket?: SubscriptionBucket): string {
  if (bucket === 'cancelled') {
    return 'ملغي / منتهي';
  }

  if (!planId) {
    return '—';
  }

  const plan = PLANS[planId as PlanId];
  return plan?.name || planId;
}

function formatUsage(row: ApiStoreItem): string {
  if (row.invitesLimit === null) {
    return `${row.invitesUsed} / غير محدود`;
  }

  return `${row.invitesUsed} / ${row.invitesLimit}`;
}

function formatTimestamp(timestamp?: number | null): string {
  if (typeof timestamp !== 'number') {
    return '—';
  }

  return new Date(timestamp).toLocaleString('ar-SA');
}

function formatDomainHref(domain?: string): string | undefined {
  if (!domain) {
    return undefined;
  }

  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

type BucketTableProps = {
  bucket: VisibleBucket;
  rows: ApiStoreItem[];
  loading: boolean;
  syncing: Record<string, boolean>;
  onSyncOne: (storeUid: string) => Promise<void>;
};

function BucketTable({
  bucket,
  rows,
  loading,
  syncing,
  onSyncOne,
}: BucketTableProps) {
  const meta = BUCKET_META[bucket];

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{meta.title}</h3>
          <Badge className={`${meta.badgeClass} rounded-full px-3 py-1`}>
            {rows.length}
          </Badge>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-right p-2">المتجر</th>
                <th className="text-right p-2">الدومين</th>
                <th className="text-right p-2">الخطة</th>
                <th className="text-right p-2">الاستخدام</th>
                <th className="text-right p-2">آخر تحديث</th>
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
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500">
                    {meta.emptyLabel}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.storeUid} className="border-b last:border-none">
                    <td className="p-2">
                      <div className="font-medium">{row.storeName || row.storeUid}</div>
                      <div className="text-xs text-gray-500">
                        {row.storeName ? `${row.storeUid} • ` : ''}
                        {row.provider} •{' '}
                        {row.connected ? 'متصل' : 'غير متصل'}
                      </div>
                    </td>
                    <td className="p-2">
                      {row.domainBase ? (
                        <a
                          href={formatDomainHref(row.domainBase)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          {row.domainBase}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2">
                      <div>{formatPlanLabel(row.planId, row.bucket)}</div>
                      <div className="text-xs text-gray-500">
                        {row.planActive ? 'نشط' : 'غير نشط'}
                      </div>
                    </td>
                    <td className="p-2">{formatUsage(row)}</td>
                    <td className="p-2">
                      <div>{formatTimestamp(row.lastUpdate)}</div>
                      {row.cancelledAt ? (
                        <div className="text-xs text-gray-500">
                          الإلغاء: {formatTimestamp(row.cancelledAt)}
                        </div>
                      ) : row.expiresAt ? (
                        <div className="text-xs text-gray-500">
                          الانتهاء: {formatTimestamp(row.expiresAt)}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2">
                      {row.canSync ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void onSyncOne(row.storeUid)}
                          disabled={Boolean(syncing[row.storeUid])}
                        >
                          {syncing[row.storeUid] ? 'مزامنة…' : 'Sync'}
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSubscriptions() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ApiStoreItem[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const { data } = await axios.get<ApiResponse>('/api/admin/subscriptions');

      if (!data.ok) {
        throw new Error(data.message || data.error);
      }

      setRows(Array.isArray(data.grouped.all) ? data.grouped.all : []);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('subscriptions_load_failed', error);
      setErr(`تعذّر تحميل الاشتراكات: ${message}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();

    if (!needle) {
      return rows;
    }

    return rows.filter((row) =>
      [row.storeUid, row.domainBase, row.provider, row.planId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const groupedRows = useMemo(() => {
    const grouped: Record<SubscriptionBucket, ApiStoreItem[]> = {
      trial: [],
      monthly: [],
      yearly: [],
      cancelled: [],
      unknown: [],
    };

    for (const row of filteredRows) {
      grouped[row.bucket].push(row);
    }

    return grouped;
  }, [filteredRows]);

  const visibleCount = useMemo(
    () =>
      BUCKET_ORDER.reduce(
        (total, bucket) => total + groupedRows[bucket].length,
        0,
      ),
    [groupedRows],
  );

  async function syncOne(storeUid: string) {
    setSyncing((current) => ({ ...current, [storeUid]: true }));

    try {
      await axios.get('/api/admin/subscription', {
        params: { storeUid, force: 1 },
      });
      await load();
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('sync_failed', error);
      window.alert(`فشل مزامنة المتجر ${storeUid}: ${message}`);
    } finally {
      setSyncing((current) => ({ ...current, [storeUid]: false }));
    }
  }

  async function refreshAll() {
    setReloading(true);
    await load();
    setReloading(false);
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">إدارة الاشتراكات</h2>
          <p className="text-sm text-gray-500">
            تقسيم المتاجر إلى تجريبي، شهري، سنوي، وملغي.
          </p>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input
            placeholder="ابحث بالمتجر / الدومين / المزود / الباقة…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="md:max-w-xs"
          />

          <Button onClick={() => void refreshAll()} disabled={reloading}>
            {reloading ? 'جارٍ التحديث…' : 'تحديث'}
          </Button>
        </div>
      </div>

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
          {err}{' '}
          <button
            onClick={() => void load()}
            className="ml-2 underline decoration-dotted hover:opacity-80"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BUCKET_ORDER.map((bucket) => (
          <Card key={bucket}>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">{BUCKET_META[bucket].title}</div>
              <div className="mt-2 text-2xl font-bold">
                {groupedRows[bucket].length}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        المعروض حالياً: {visibleCount} متجر.
        {groupedRows.unknown.length > 0
          ? ` هناك ${groupedRows.unknown.length} متجر ببيانات اشتراك غير مكتملة ولم يتم إدراجها ضمن القوائم الأربع.`
          : ''}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {BUCKET_ORDER.map((bucket) => (
          <BucketTable
            key={bucket}
            bucket={bucket}
            rows={groupedRows[bucket]}
            loading={loading}
            syncing={syncing}
            onSyncOne={syncOne}
          />
        ))}
      </div>
    </div>
  );
}
