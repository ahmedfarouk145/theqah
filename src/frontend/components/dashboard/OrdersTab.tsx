'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download, FileText, Check, AlertCircle } from 'lucide-react';
import axios from '@/lib/axiosInstance';

import Pagination from '@/components/ui/Pagination';

type Order = {
  id: string;                // Document ID في كولكشن orders
  orderId: string;           // رقم الطلب الظاهر للمستخدم (قد يساوي id)
  productId?: string;
  productName?: string;
  status?: string;
  createdAt?: number | string;
};

export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  // Pagination state
  const [hasMore, setHasMore] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (currentCursor) {
        params.append('cursor', currentCursor);
      }

      const res = await axios.get(`/api/orders?${params}`);
      const list: Order[] = res.data?.orders ?? [];
      const pagination = res.data?.pagination;

      setOrders(list);
      setHasMore(pagination?.hasMore ?? false);
    } catch {
      setError('حدث خطأ أثناء تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [currentCursor]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleNextPage = () => {
    if (orders.length > 0 && hasMore) {
      const nextCursor = orders[orders.length - 1].id;
      setCursors(prev => [...prev, currentCursor!]);
      setCurrentCursor(nextCursor);
    }
  };

  const handlePreviousPage = () => {
    if (cursors.length > 0) {
      const prevCursor = cursors[cursors.length - 1];
      setCursors(prev => prev.slice(0, -1));
      setCurrentCursor(prevCursor);
    } else {
      setCurrentCursor(null);
    }
  };

  // Download export with auth
  const handleExport = async (type: 'csv' | 'pdf') => {
    try {
      const url = `/api/reviews/export-${type}`;
      const response = await axios.get(url, { responseType: 'blob' });

      // Create blob and download
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `reviews.${type}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Export error:', err);
      setError(`فشل التصدير: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
    }
  };

  const fmtDate = (v?: number | string) => {
    if (v == null) return '—';
    const n = typeof v === 'string' ? Number(v) : v;
    const d = Number.isFinite(n) ? new Date(Number(n)) : new Date(v as string);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  const getStatusBadge = (order: Order) => {
    const rawStatus = String(order.status || 'unknown').trim();
    const normalizedStatus = rawStatus.toLowerCase();

    if (['paid', 'completed', 'delivered', 'shipped'].includes(normalizedStatus)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
          <Check className="w-3 h-3" />
          {normalizedStatus === 'paid' ? 'مدفوع' :
            normalizedStatus === 'shipped' ? 'تم الشحن' :
              normalizedStatus === 'delivered' ? 'تم التسليم' : 'مكتمل'}
        </span>
      );
    } else if (['pending', 'processing'].includes(normalizedStatus)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full border border-amber-200">
          <AlertCircle className="w-3 h-3" />
          {normalizedStatus === 'processing' ? 'قيد المعالجة' : 'قيد الانتظار'}
        </span>
      );
    } else if (normalizedStatus === 'created') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-200">
          <FileText className="w-3 h-3" />
          تم الإنشاء
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 rounded-full border border-gray-200">
          <AlertCircle className="w-3 h-3" />
          {rawStatus || 'غير معروف'}
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 font-medium">جاري تحميل الطلبات...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button
          onClick={fetchOrders}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          المحاولة مرة أخرى
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">إدارة الطلبات</h3>
            <p className="text-sm text-gray-600">عرض الطلبات المتزامنة من سلة وزد</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 border-r border-gray-200 pr-3 mr-1">
              <button
                onClick={() => handleExport('csv')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all duration-200 shadow-sm"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all duration-200 shadow-sm"
              >
                <FileText className="w-4 h-4" />
                PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  رقم الطلب
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  المنتج
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  التاريخ
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  حالة الطلب
                </th>

              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td className="px-6 py-12 text-center text-gray-500" colSpan={4}>
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <FileText className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">لا توجد طلبات</p>
                        <p className="text-xs text-gray-500">ستظهر هنا الطلبات المتزامنة من سلة وزد</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((o, index) => {
                  const rowId = o.id;
                  return (
                    <tr
                      key={rowId || o.orderId}
                      className="hover:bg-gray-50 transition-colors duration-150"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">
                          {o.orderId || rowId}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {o.productName || o.productId || (
                            <span className="text-gray-400 italic">غير محدد</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600 font-mono">
                          {fmtDate(o.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(o)}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      {orders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">إجمالي الطلبات</p>
                <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">مرتبطة بمنتج</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {orders.filter(o => !!o.productId).length}
                </p>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">بحالة معروفة</p>
                <p className="text-2xl font-bold text-amber-600">
                  {orders.filter(o => !!o.status && o.status !== 'unknown').length}
                </p>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        hasMore={hasMore}
        onNext={handleNextPage}
        onPrevious={handlePreviousPage}
        hasPrevious={cursors.length > 0 || currentCursor !== null}
        loading={loading}
        currentCount={orders.length}
        itemName="طلب"
      />
    </div>
  );
}
