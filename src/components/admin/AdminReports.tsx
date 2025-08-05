'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface Report {
  id: string;
  reason: string;
  reviewId: string;
  createdAt?: string | Date;
  email?: string;
  name?: string;
}

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/review-reports');
      setReports(res.data.alerts);
    } catch {
      setError('حدث خطأ أثناء تحميل البلاغات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold text-green-800 mb-4">🚨 بلاغات التقييمات</h2>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : reports.length === 0 ? (
        <p>لا توجد بلاغات حالياً.</p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white border p-4 rounded-lg shadow-sm space-y-1"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-800">📣 بلاغ على تقييم #{report.reviewId}</h3>
              </div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">السبب:</span> {report.reason}
              </p>
              {report.email && (
                <p className="text-xs text-gray-500">المبلغ: {report.name} ({report.email})</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
