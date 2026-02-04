// src/components/admin/AdminMonitoring.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface MetricsSummary {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    avgResponseTime: number;
    p95ResponseTime: number;
}

interface EndpointStats {
    endpoint: string;
    count: number;
    errors: number;
    avgDuration: number;
    p95Duration: number;
}

interface Alert {
    type: 'error' | 'warning' | 'info';
    message: string;
    timestamp: Date;
}

interface RealtimeData {
    requestsPerMinute: Record<string, number>;
    recentActivity: Array<{
        id: string;
        type: string;
        endpoint?: string;
        timestamp: Date;
        severity?: string;
    }>;
    activeEndpoints: string[];
    health: {
        status: 'healthy' | 'warning' | 'critical';
        message: string;
    };
}

export default function AdminMonitoring() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');
    const refreshInterval = 30000;

    const [summary, setSummary] = useState<MetricsSummary | null>(null);
    const [topEndpoints, setTopEndpoints] = useState<EndpointStats[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [realtime, setRealtime] = useState<RealtimeData | null>(null);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchRealtime, refreshInterval);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);

        try {
            const adminSecret = localStorage.getItem('adminSecret');
            if (!adminSecret) {
                router.push('/admin/login');
                return;
            }

            const response = await fetch(`/api/admin/monitor-app?period=${period}`, {
                headers: {
                    Authorization: `Bearer ${adminSecret}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch monitoring data');
            }

            const data = await response.json();

            setSummary(data.summary);
            setTopEndpoints(data.topEndpoints || []);
            setAlerts(data.alerts || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const fetchRealtime = async () => {
        try {
            const adminSecret = localStorage.getItem('adminSecret');
            if (!adminSecret) return;

            const response = await fetch('/api/admin/monitor-realtime', {
                headers: {
                    Authorization: `Bearer ${adminSecret}`,
                },
            });

            if (!response.ok) return;

            const data = await response.json();
            setRealtime(data);
        } catch (err) {
            console.error('Failed to fetch realtime data:', err);
        }
    };

    if (loading && !summary) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
                    <p className="mt-4 text-gray-600">جاري تحميل بيانات المراقبة...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h2 className="text-red-800 font-semibold text-lg mb-2">خطأ</h2>
                <p className="text-red-600">{error}</p>
                <button
                    onClick={() => fetchData()}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                    إعادة المحاولة
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">مراقبة التطبيق</h2>
                <div className="flex gap-3">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as '24h' | '7d' | '30d')}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                        <option value="24h">آخر 24 ساعة</option>
                        <option value="7d">آخر 7 أيام</option>
                        <option value="30d">آخر 30 يوم</option>
                    </select>
                    <button
                        onClick={() => fetchData()}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        تحديث
                    </button>
                </div>
            </div>

            {/* Health Status */}
            {realtime && (
                <div
                    className={`p-4 rounded-lg border ${realtime.health.status === 'healthy'
                        ? 'bg-green-50 border-green-200'
                        : realtime.health.status === 'warning'
                            ? 'bg-yellow-50 border-yellow-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        {realtime.health.status === 'healthy' ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        ) : realtime.health.status === 'warning' ? (
                            <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        ) : (
                            <XCircle className="w-6 h-6 text-red-600" />
                        )}
                        <div>
                            <p className="font-semibold">
                                حالة النظام: {realtime.health.status === 'healthy' ? 'سليم' : realtime.health.status === 'warning' ? 'تحذير' : 'حرج'}
                            </p>
                            <p className="text-sm text-gray-700">{realtime.health.message}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">⚠️ التنبيهات</h3>
                    {alerts.map((alert, i) => (
                        <div
                            key={i}
                            className={`p-3 rounded border ${alert.type === 'error'
                                ? 'bg-red-50 border-red-300'
                                : alert.type === 'warning'
                                    ? 'bg-yellow-50 border-yellow-300'
                                    : 'bg-blue-50 border-blue-300'
                                }`}
                        >
                            <p className="text-sm font-medium">{alert.message}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-gray-600 text-sm font-medium">إجمالي الطلبات</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                            {(summary.totalRequests || 0).toLocaleString()}
                        </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-gray-600 text-sm font-medium">إجمالي الأخطاء</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">
                            {(summary.totalErrors || 0).toLocaleString()}
                        </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-gray-600 text-sm font-medium">معدل الأخطاء</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                            {(summary.errorRate || 0).toFixed(2)}%
                        </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-gray-600 text-sm font-medium">متوسط الاستجابة</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                            {Math.round(summary.avgResponseTime || 0)}ms
                        </p>
                    </div>
                </div>
            )}

            {/* Top Endpoints Table */}
            <div className="bg-gray-50 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">📊 أكثر الـ Endpoints استخداماً</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                    Endpoint
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                    الطلبات
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                    الأخطاء
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                    متوسط الوقت
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {topEndpoints.map((endpoint, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                                        {endpoint.endpoint}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                        {(endpoint.count || 0).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <span
                                            className={
                                                (endpoint.errors || 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-700'
                                            }
                                        >
                                            {endpoint.errors || 0}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                        {Math.round(endpoint.avgDuration || 0)}ms
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
