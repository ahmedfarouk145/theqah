/**
 * User Activity Dashboard Component
 * ==================================
 * 
 * Admin view for user activity logs and analytics
 */

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, Users, Activity } from 'lucide-react';

interface ActivityStats {
  dau: number;
  mau: number;
  featureUsage: Record<string, number>;
}

export default function UserActivityDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [dauRes, mauRes, usageRes] = await Promise.all([
        axios.get(`/api/analytics/activity?action=dau&startDate=${today}`),
        axios.get(`/api/analytics/activity?action=mau&startDate=${today}`),
        axios.get(`/api/analytics/activity?action=feature_usage&startDate=${thirtyDaysAgo}&endDate=${today}`)
      ]);

      setStats({
        dau: dauRes.data.dau,
        mau: mauRes.data.mau,
        featureUsage: usageRes.data.usage
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
      console.error('[Activity Dashboard] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <button 
              onClick={loadStats}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  const topFeatures = Object.entries(stats.featureUsage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">User Activity Analytics</h1>
        <button 
          onClick={loadStats}
          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-2"
        >
          <Activity className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Daily Active Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.dau}</div>
            <p className="text-xs text-muted-foreground">
              Users active today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Monthly Active Users
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.mau}</div>
            <p className="text-xs text-muted-foreground">
              Users active this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Engagement Rate
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.mau > 0 ? ((stats.dau / stats.mau) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              DAU / MAU ratio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Feature Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Top Features (Last 30 Days)</CardTitle>
          <CardDescription>Most used features and actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topFeatures.map(([feature, count]) => (
              <div key={feature} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full" />
                  <span className="font-medium">{feature}</span>
                </div>
                <span className="text-sm text-muted-foreground">{count} uses</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
