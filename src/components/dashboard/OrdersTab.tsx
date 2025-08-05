'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance'; // ✅ استخدم النسخة المعدّلة من axios

type Order = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  createdAt: string;
  sent: boolean;
};

export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await axios.get('/api/orders');
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error('Error loading orders', err);
      setError('حدث خطأ أثناء تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  };

  const sendReviewLink = async (id: string) => {
    setSendingId(id);
    try {
      await axios.post('/api/orders/send-review', { id });
      fetchOrders();
    } catch (err) {
      alert('فشل في إرسال رابط التقييم');
    } finally {
      setSendingId(null);
    }
  };

  if (loading) return <p>جاري تحميل الطلبات...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border rounded-md">
        <thead className="bg-gray-100 text-sm">
          <tr>
            <th className="p-2">العميل</th>
            <th className="p-2">الهاتف</th>
            <th className="p-2">الإيميل</th>
            <th className="p-2">التاريخ</th>
            <th className="p-2">الحالة</th>
            <th className="p-2">إجراء</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t text-center text-sm">
              <td className="p-2">{order.name}</td>
              <td className="p-2">{order.phone}</td>
              <td className="p-2">{order.email || '—'}</td>
              <td className="p-2">
                {new Date(order.createdAt).toLocaleDateString()}
              </td>
              <td className="p-2">
                {order.sent ? (
                  <span className="text-green-600">تم الإرسال</span>
                ) : (
                  <span className="text-gray-600">لم يُرسل</span>
                )}
              </td>
              <td className="p-2">
                {!order.sent && (
                  <button
                    onClick={() => sendReviewLink(order.id)}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded"
                    disabled={sendingId === order.id}
                  >
                    {sendingId === order.id ? 'يتم الإرسال...' : 'إرسال التقييم'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
