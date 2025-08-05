// src/components/dashboard/settings/SallaIntegrationTab.tsx
'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { useAuth } from '@/contexts/AuthContext';

export default function StoreIntegration() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);

  useEffect(() => {
    const fetchConnectionStatus = async () => {
      if (!token) return;

      try {
        const res = await axios.get('/api/store/connection', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setConnected(res.data.connected);
        setConnectedAt(res.data.connectedAt || null);
      } catch (err) {
        console.error('Connection status error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConnectionStatus();
  }, [token]);

  const handleConnect = () => {
    window.location.href = `https://salla.sa/oauth/authorize?response_type=code&client_id=${process.env.NEXT_PUBLIC_SALLA_CLIENT_ID}&redirect_uri=${process.env.NEXT_PUBLIC_BASE_URL}/api/salla/callback`;
  };

  if (loading) return <p>جارٍ التحقق من حالة الربط...</p>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">الربط مع متجر سلة</h2>

      {connected ? (
        <div className="bg-green-50 border border-green-300 p-4 rounded-lg">
          <p className="text-green-800 font-semibold">تم الربط بنجاح مع سلة ✅</p>
          {connectedAt && (
            <p className="text-sm text-gray-600 mt-1">
              تاريخ الربط: {new Date(connectedAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={handleConnect}
          className="px-5 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition"
        >
          ربط مع سلة
        </button>
      )}
    </div>
  );
}
