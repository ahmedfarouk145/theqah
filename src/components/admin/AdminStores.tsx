'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface Store {
  id: string;
  name?: string;
  email?: string;
  username?: string;
  connected?: boolean;
}

export default function AdminStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await axios.get('/api/admin/stores');
        setStores(res.data.stores);
      } catch (error) {
        console.error('Error loading stores:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-green-800">🏪 المتاجر المسجلة</h2>

      {loading ? (
        <p>جارٍ التحميل...</p>
      ) : stores.length === 0 ? (
        <p>لا يوجد متاجر حتى الآن.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-xl">
            <thead>
              <tr className="bg-gray-100 text-gray-700 text-sm">
                <th className="px-4 py-2 border">ID</th>
                <th className="px-4 py-2 border">اسم المتجر</th>
                <th className="px-4 py-2 border">البريد</th>
                <th className="px-4 py-2 border">المعرف</th>
                <th className="px-4 py-2 border">مرتبط بسلة؟</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} className="text-sm text-center">
                  <td className="px-4 py-2 border">{store.id}</td>
                  <td className="px-4 py-2 border">{store.name || '-'}</td>
                  <td className="px-4 py-2 border">{store.email || '-'}</td>
                  <td className="px-4 py-2 border">{store.username || '-'}</td>
                  <td className="px-4 py-2 border">
                    {store.connected ? (
                      <span className="text-green-600 font-medium">✅ نعم</span>
                    ) : (
                      <span className="text-red-500">❌ لا</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
