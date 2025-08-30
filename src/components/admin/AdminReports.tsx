'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { app } from '@/lib/firebase';
import axios from '@/lib/axiosInstance';

interface Report {
  id: string;
  reason: string;
  reviewId: string;
  createdAt?: string | Date | number;
  email?: string;
  name?: string;
  resolved?: boolean;
  resolvedAt?: string | Date | number;
}

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'resolved' | 'unresolved'>('all');

  // avoid setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchReports = useCallback(async () => {
    if (!user) return;

    try {
      if (mountedRef.current) {
        setLoading(true);
        setError('');
      }

      let url = '/api/admin/review-reports';
      if (filter === 'resolved') url += '?resolved=true';
      else if (filter === 'unresolved') url += '?resolved=false';

      const res = await axios.get<{ alerts: Report[] }>(url);
      if (mountedRef.current) {
        setReports(res.data.alerts || []);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const err = error as { response?: { status?: number } };
      if (err.response?.status === 401) {
        setError('غير مخول للوصول. يرجى التأكد من صلاحيات المشرف.');
      } else {
        setError('حدث خطأ أثناء تحميل البلاغات');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchReports();
    }
  }, [authLoading, user, fetchReports]);

  const resolveReport = async (reportId: string, action: 'resolve' | 'delete') => {
    if (!user) return;
    try {
      await axios.post('/api/admin/reports/resolve', { reportId, action });
      if (!mountedRef.current) return;

      if (action === 'delete') {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      } else {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, resolved: true, resolvedAt: Date.now() } : r))
        );
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      alert('فشل في معالجة البلاغ: ' + (err.response?.data?.message || err.message || ''));
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p>جاري التحقق من الهوية...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center p-8">
        <p className="text-red-500">يرجى تسجيل الدخول للوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-green-800">🚨 بلاغات التقييمات</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${filter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            الكل ({reports.length})
          </button>
          <button
            onClick={() => setFilter('unresolved')}
            className={`px-3 py-1 rounded text-sm ${filter === 'unresolved' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            غير محلولة
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`px-3 py-1 rounded text-sm ${filter === 'resolved' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            محلولة
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
            <p>جاري التحميل...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 mb-3">{error}</p>
          <button onClick={fetchReports} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
            إعادة المحاولة
          </button>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">
            {filter === 'all' ? 'لا توجد بلاغات حالياً' : filter === 'resolved' ? 'لا توجد بلاغات محلولة' : 'لا توجد بلاغات غير محلولة'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className={`border p-4 rounded-lg shadow-sm space-y-3 ${report.resolved ? 'bg-green-50 border-green-200' : 'bg-white'}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 mb-2">
                    📣 بلاغ على تقييم #{report.reviewId}
                    {report.resolved && (
                      <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">محلول</span>
                    )}
                  </h3>

                  <p className="text-sm text-gray-700 mb-2">
                    <span className="font-medium">السبب:</span> {report.reason}
                  </p>

                  {report.email && (
                    <p className="text-xs text-gray-500 mb-2">
                      المبلغ: {report.name} ({report.email})
                    </p>
                  )}

                  {report.createdAt && (
                    <p className="text-xs text-gray-400">
                      تاريخ البلاغ: {new Date(report.createdAt).toLocaleDateString('ar-EG')}
                    </p>
                  )}

                  {report.resolved && report.resolvedAt && (
                    <p className="text-xs text-green-600">
                      تم الحل في: {new Date(report.resolvedAt).toLocaleDateString('ar-EG')}
                    </p>
                  )}
                </div>

                {!report.resolved && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveReport(report.id, 'resolve')}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      تم الحل
                    </button>
                    <button
                      onClick={() => resolveReport(report.id, 'delete')}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      حذف
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
