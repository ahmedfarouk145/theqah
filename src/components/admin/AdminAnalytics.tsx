'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance';

export default function AdminAnalytics() {
  const [stats, setStats] = useState<{
    totalStores: number;
    totalReviews: number;
    totalAlerts: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/admin/stats');
        setStats(res.data);
      } catch (err) {
        console.error('Failed to fetch admin stats', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold text-green-800 mb-4">📊 إحصائيات النظام</h2>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border rounded-xl p-6 shadow">
            <p className="text-sm text-gray-500 mb-2">عدد المتاجر</p>
            <p className="text-3xl font-bold text-green-800">{stats.totalStores}</p>
          </div>
          <div className="bg-white border rounded-xl p-6 shadow">
            <p className="text-sm text-gray-500 mb-2">عدد التقييمات</p>
            <p className="text-3xl font-bold text-green-800">{stats.totalReviews}</p>
          </div>
          <div className="bg-white border rounded-xl p-6 shadow">
            <p className="text-sm text-gray-500 mb-2">عدد البلاغات</p>
            <p className="text-3xl font-bold text-red-600">{stats.totalAlerts}</p>
          </div>
        </div>
      ) : (
        <p className="text-red-500">تعذر تحميل البيانات</p>
      )}
    </div>
  );
}
