'use client';

import { useState, useEffect } from 'react';

export default function ZidIntegrationTab() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const r = await fetch('/api/zid/status');
        if (r.ok) {
          const data = await r.json();
          setConnected(Boolean(data?.connected));
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
    };
    fetchStatus();
  }, []);

  const connect = () => {
    window.location.href = '/connect/zid';
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      await fetch('/api/zid/disconnect', { method: 'POST' });
      setConnected(false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        اربط متجرك على <strong>زد</strong> لإرسال روابط التقييم تلقائيًا بعد الطلبات.
      </p>

      {connected === null ? (
        <p>جارٍ التحقق من حالة الربط…</p>
      ) : connected ? (
        <div className="flex items-center gap-3">
          <span className="text-green-700">✅ متصل</span>
          <button
            onClick={disconnect}
            disabled={loading}
            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            {loading ? 'جاري الفك…' : 'فك الارتباط'}
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800"
        >
          ربط زد الآن
        </button>
      )}
    </div>
  );
}
