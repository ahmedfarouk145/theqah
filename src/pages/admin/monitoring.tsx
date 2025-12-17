import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useRouter } from "next/router";

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
  type: "error" | "warning" | "info";
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
    status: "healthy" | "warning" | "critical";
    message: string;
  };
}

const AdminMonitoringDashboard: NextPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h");
  const refreshInterval = 30000; // 30 seconds
  
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [topEndpoints, setTopEndpoints] = useState<EndpointStats[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchRealtime, refreshInterval);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, refreshInterval]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const adminSecret = localStorage.getItem("adminSecret");
      if (!adminSecret) {
        router.push("/admin/login");
        return;
      }

      const response = await fetch(`/api/admin/monitor-app?period=${period}`, {
        headers: {
          Authorization: `Bearer ${adminSecret}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch monitoring data");
      }

      const data = await response.json();
      
      setSummary(data.summary);
      setTopEndpoints(data.topEndpoints || []);
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchRealtime = async () => {
    try {
      const adminSecret = localStorage.getItem("adminSecret");
      if (!adminSecret) return;

      const response = await fetch("/api/admin/monitor-realtime", {
        headers: {
          Authorization: `Bearer ${adminSecret}`,
        },
      });

      if (!response.ok) return;

      const data = await response.json();
      setRealtime(data);
    } catch (err) {
      console.error("Failed to fetch realtime data:", err);
    }
  };

  if (loading && !summary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">Error</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Application Monitoring
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Real-time system health and performance
              </p>
            </div>
            <div className="flex gap-3">
              {/* Period Selector */}
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as "24h" | "7d" | "30d")}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>

              {/* Refresh Button */}
              <button
                onClick={() => fetchData()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Health Status */}
        {realtime && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              realtime.health.status === "healthy"
                ? "bg-green-50 border-green-200"
                : realtime.health.status === "warning"
                ? "bg-yellow-50 border-yellow-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {realtime.health.status === "healthy" ? "✅" : 
                 realtime.health.status === "warning" ? "⚠️" : "❌"}
              </span>
              <div>
                <p className="font-semibold">System Status: {realtime.health.status}</p>
                <p className="text-sm text-gray-700">{realtime.health.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">⚠️ Alerts</h2>
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`p-3 rounded border ${
                  alert.type === "error"
                    ? "bg-red-50 border-red-300"
                    : alert.type === "warning"
                    ? "bg-yellow-50 border-yellow-300"
                    : "bg-blue-50 border-blue-300"
                }`}
              >
                <p className="text-sm font-medium">{alert.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Total Requests</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {summary.totalRequests.toLocaleString()}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Total Errors</p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                {summary.totalErrors.toLocaleString()}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Error Rate</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {summary.errorRate.toFixed(2)}%
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600 text-sm font-medium">Avg Response</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {Math.round(summary.avgResponseTime)}ms
              </p>
            </div>
          </div>
        )}

        {/* Top Endpoints Table */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">📊 Top Endpoints</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Endpoint
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Errors
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Avg Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    P95 Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topEndpoints.map((endpoint, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">
                      {endpoint.endpoint}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {endpoint.count.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={
                          endpoint.errors > 0 ? "text-red-600 font-medium" : "text-gray-700"
                        }
                      >
                        {endpoint.errors}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {Math.round(endpoint.avgDuration)}ms
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {Math.round(endpoint.p95Duration)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        {realtime && realtime.recentActivity.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">🔴 Live Activity</h2>
              <p className="text-sm text-gray-600">Last 5 minutes</p>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {realtime.recentActivity.slice(0, 50).map((activity) => (
                <div key={activity.id} className="px-6 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          activity.severity === "error"
                            ? "bg-red-100 text-red-800"
                            : activity.severity === "warning"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {activity.type}
                      </span>
                      {activity.endpoint && (
                        <span className="text-sm font-mono text-gray-700">
                          {activity.endpoint}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminMonitoringDashboard;
