'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { isAxiosError } from 'axios';
import { useRouter } from 'next/router';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, XCircle } from 'lucide-react';
import axios from '@/lib/axiosInstance';
import { app } from '@/lib/firebase';
import type {
  AdminMonitoringAlert,
  AdminMonitoringAppResponse,
  AdminMonitoringEndpointStats,
  AdminMonitoringRealtimeResponse,
  AdminMonitoringSummary,
} from '@/types/admin-monitoring';

const REFRESH_INTERVAL_MS = 30000;

function getSeverityClass(severity?: string): string {
  if (severity === 'error' || severity === 'critical') {
    return 'bg-red-100 text-red-800';
  }

  if (severity === 'warning') {
    return 'bg-yellow-100 text-yellow-800';
  }

  return 'bg-green-100 text-green-800';
}

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response?.status === 403) {
      return 'ليس لديك صلاحية الوصول إلى بيانات المراقبة.';
    }

    if (error.response?.status === 401) {
      return 'انتهت الجلسة أو لم يتم تسجيل الدخول.';
    }

    return (error.response?.data as { message?: string } | undefined)?.message || error.message;
  }

  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع.';
}

export default function AdminMonitoring() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [summary, setSummary] = useState<AdminMonitoringSummary | null>(null);
  const [topEndpoints, setTopEndpoints] = useState<AdminMonitoringEndpointStats[]>([]);
  const [alerts, setAlerts] = useState<AdminMonitoringAlert[]>([]);
  const [realtime, setRealtime] = useState<AdminMonitoringRealtimeResponse | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setAuthLoading(false);
      return;
    }

    try {
      const auth = getAuth(app);
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
        if (!currentUser) {
          router.push('/login');
        }
      });
      return unsubscribe;
    } catch (authError) {
      console.warn('[AdminMonitoring] Firebase auth error:', authError);
      setAuthLoading(false);
      setError('تعذر التحقق من جلسة المشرف.');
    }
  }, [router]);

  const fetchRealtime = useCallback(async () => {
    if (!user) {
      return;
    }

    const { data } = await axios.get<AdminMonitoringRealtimeResponse>('/api/admin/monitor-realtime');
    setRealtime(data);
  }, [user]);

  const fetchData = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [appResponse, realtimeResponse] = await Promise.all([
        axios.get<AdminMonitoringAppResponse>('/api/admin/monitor-app', { params: { period } }),
        axios.get<AdminMonitoringRealtimeResponse>('/api/admin/monitor-realtime'),
      ]);

      setSummary(appResponse.data.summary);
      setTopEndpoints(appResponse.data.topEndpoints || []);
      setAlerts(appResponse.data.alerts || []);
      setRealtime(realtimeResponse.data);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, [period, user]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    void fetchData();
    const interval = setInterval(() => {
      void fetchRealtime().catch((realtimeError) => {
        console.error('[AdminMonitoring] realtime refresh failed:', realtimeError);
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [authLoading, fetchData, fetchRealtime, user]);

  if (authLoading || (loading && !summary)) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-green-600" />
          <p className="mt-4 text-gray-600">جاري تحميل بيانات المراقبة...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800">تسجيل الدخول مطلوب</h2>
        <p className="mt-2 text-red-600">يجب تسجيل الدخول بحساب مشرف للوصول إلى هذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">مراقبة التطبيق</h2>
          <p className="mt-1 text-sm text-gray-600">عرض مباشر لصحة التطبيق والـ API.</p>
        </div>

        <div className="flex gap-3">
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as '24h' | '7d' | '30d')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="24h">آخر 24 ساعة</option>
            <option value="7d">آخر 7 أيام</option>
            <option value="30d">آخر 30 يوم</option>
          </select>
          <button
            onClick={() => void fetchData()}
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="font-semibold text-red-800">تعذر تحميل بيانات المراقبة</h3>
          <p className="mt-2 text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      {realtime ? (
        <div
          className={`rounded-lg border p-4 ${
            realtime.health.status === 'healthy'
              ? 'border-green-200 bg-green-50'
              : realtime.health.status === 'warning'
                ? 'border-yellow-200 bg-yellow-50'
                : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-center gap-3">
            {realtime.health.status === 'healthy' ? (
              <CheckCircle className="h-6 w-6 text-green-600" />
            ) : realtime.health.status === 'warning' ? (
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            ) : (
              <XCircle className="h-6 w-6 text-red-600" />
            )}
            <div>
              <p className="font-semibold">
                حالة النظام:{' '}
                {realtime.health.status === 'healthy'
                  ? 'سليم'
                  : realtime.health.status === 'warning'
                    ? 'تحذير'
                    : 'حرج'}
              </p>
              <p className="text-sm text-gray-700">{realtime.health.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      {alerts.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">التنبيهات</h3>
          {alerts.map((alert) => (
            <div
              key={`${alert.type}-${alert.timestamp}-${alert.message}`}
              className={`rounded border p-3 ${
                alert.type === 'error'
                  ? 'border-red-300 bg-red-50'
                  : alert.type === 'warning'
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-blue-300 bg-blue-50'
              }`}
            >
              <p className="text-sm font-medium">{alert.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-600">إجمالي الطلبات</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.totalRequests.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-600">إجمالي الأخطاء</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{summary.totalErrors.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-600">معدل الأخطاء</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.errorRate.toFixed(2)}%</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-600">متوسط الاستجابة</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{Math.round(summary.avgResponseTime)}ms</p>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg bg-gray-50">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-lg font-semibold text-gray-900">أكثر الـ Endpoints استخداماً</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-100 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-right font-medium">Endpoint</th>
                <th className="px-4 py-3 text-right font-medium">الطلبات</th>
                <th className="px-4 py-3 text-right font-medium">الأخطاء</th>
                <th className="px-4 py-3 text-right font-medium">متوسط الوقت</th>
                <th className="px-4 py-3 text-right font-medium">P95</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {topEndpoints.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    لا توجد بيانات متاحة لهذا النطاق الزمني.
                  </td>
                </tr>
              ) : (
                topEndpoints.map((endpoint) => (
                  <tr key={endpoint.endpoint} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-900">{endpoint.endpoint}</td>
                    <td className="px-4 py-3 text-gray-700">{endpoint.count.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={endpoint.errors > 0 ? 'font-medium text-red-600' : 'text-gray-700'}>
                        {endpoint.errors}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{Math.round(endpoint.avgDuration)}ms</td>
                    <td className="px-4 py-3 text-gray-700">{Math.round(endpoint.p95Duration)}ms</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {realtime && realtime.recentActivity.length > 0 ? (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">النشاط المباشر</h3>
            <p className="text-sm text-gray-600">آخر خمس دقائق</p>
          </div>
          <div className="max-h-96 divide-y divide-gray-200 overflow-y-auto">
            {realtime.recentActivity.map((activity) => (
              <div key={activity.id} className="px-6 py-3 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${getSeverityClass(activity.severity)}`}>
                      {activity.type}
                    </span>
                    {activity.endpoint ? (
                      <span className="font-mono text-sm text-gray-700">{activity.endpoint}</span>
                    ) : null}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(activity.timestamp).toLocaleTimeString('ar-EG')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
