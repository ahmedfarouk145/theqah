'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axiosInstance';

type AnalyticsData = {
  totalOrders: number;
  totalReviews: number;
  positiveRate: number;
  ordersChart: { month: string; count: number }[];
  reviewsChart: { month: string; positive: number; negative: number }[];
};

export default function DashboardAnalytics() {
  const { token } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const res = await axios.get('/api/store/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data);
      } catch (err) {
        console.error('Dashboard API error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  if (loading) return <p>جاري تحميل الإحصائيات...</p>;
  if (!data) return <p>تعذر تحميل البيانات.</p>;

  return (
    <div className="space-y-8">
      {/* إجماليات */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-green-100 p-4 rounded-lg text-center">
          <h3 className="text-sm text-gray-600">إجمالي الطلبات</h3>
          <p className="text-2xl font-bold text-green-800">{data.totalOrders}</p>
        </div>
        <div className="bg-yellow-100 p-4 rounded-lg text-center">
          <h3 className="text-sm text-gray-600">إجمالي التقييمات</h3>
          <p className="text-2xl font-bold text-yellow-800">{data.totalReviews}</p>
        </div>
        <div className="bg-blue-100 p-4 rounded-lg text-center">
          <h3 className="text-sm text-gray-600">نسبة الإيجابية</h3>
          <p className="text-2xl font-bold text-blue-800">{data.positiveRate}%</p>
        </div>
      </div>

      {/* رسم بياني للطلبات */}
      <div>
        <h2 className="text-lg font-semibold mb-2">الطلبات شهريًا</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.ordersChart}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#22c55e" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* رسم بياني للتقييمات */}
      <div>
        <h2 className="text-lg font-semibold mb-2">التقييمات شهريًا</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.reviewsChart}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="positive" fill="#3b82f6" />
            <Bar dataKey="negative" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
