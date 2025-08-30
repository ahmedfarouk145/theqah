'use client';

import { useEffect, useState, useRef } from 'react';
import { Upload, Plus, Download, FileText, Send, Check, X, AlertCircle } from 'lucide-react';
import axios from '@/lib/axiosInstance';
import { isAxiosError } from 'axios';

type Order = {
  id: string;                // Document ID في كولكشن orders
  orderId: string;           // رقم الطلب الظاهر للمستخدم (قد يساوي id)
  productId?: string;
  productName?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  createdAt?: number | string;
  inviteStatus?: 'sent' | 'not_sent' | 'failed';
  reviewSent?: boolean;
};

export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [csvUploading, setCsvUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try {
      const res = await axios.get('/api/orders');
      const list: Order[] = res.data?.items ?? res.data?.orders ?? [];
      setOrders((Array.isArray(list) ? list : []).sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
      ));
    } catch (err: unknown) {
      console.error('Error loading orders', err);
      setError('حدث خطأ أثناء تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  };

  const sendReviewLink = async (id: string) => {
    setSendingId(id);
    try {
      // أرسل document id كما يتوقع الإندبوينت
      const res = await axios.post('/api/orders/send-review?debug=1', { id });
      await fetchOrders();
      // يمكن إظهار الرابط المرجّع من السيرفر إن أردت
      if (res?.data?.link) {
        alert(`تم إرسال رابط التقييم ✅\n${res.data.link}`);
      } else {
        alert('تم إرسال رابط التقييم ✅');
      }
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data;
        console.error('send-review error:', status, data);
        alert(`فشل في إرسال رابط التقييم ❌\n${JSON.stringify(data ?? { status }, null, 2)}`);
      } else {
        alert('فشل في إرسال رابط التقييم ❌');
      }
    } finally {
      setSendingId(null);
    }
  };

  const importCsv = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    setCsvUploading(true);
    try {
      await axios.post('/api/orders/import', fd);
      await fetchOrders();
    } finally {
      setCsvUploading(false);
    }
  };

  const addManual = async () => {
    const orderId = prompt('رقم الطلب؟');
    if (!orderId?.trim()) return;
    setAdding(true);
    try {
      await axios.post('/api/orders/add', { orderId });
      await fetchOrders();
    } finally {
      setAdding(false);
    }
  };

  const fmtDate = (v?: number | string) => {
    if (v == null) return '—';
    const n = typeof v === 'string' ? Number(v) : v;
    const d = Number.isFinite(n) ? new Date(Number(n)) : new Date(v as string);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  const getStatusBadge = (order: Order) => {
    const sent = order.reviewSent ?? (order.inviteStatus === 'sent');
    
    if (sent) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
          <Check className="w-3 h-3" />
          تم الإرسال
        </span>
      );
    } else if (order.inviteStatus === 'failed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-full border border-red-200">
          <X className="w-3 h-3" />
          فشل
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 rounded-full border border-gray-200">
          <AlertCircle className="w-3 h-3" />
          لم يُرسل
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
            <p className="text-sm text-gray-600">استيراد وإدارة طلبات العملاء</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              disabled={csvUploading}
            >
              <Upload className="w-4 h-4" />
              {csvUploading ? 'جاري الاستيراد…' : 'استيراد CSV'}
            </button>
            
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await importCsv(f);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />

            <button
              onClick={addManual}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:ring-4 focus:ring-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              disabled={adding}
            >
              <Plus className="w-4 h-4" />
              {adding ? 'جاري الإضافة…' : 'إضافة طلب'}
            </button>

            <div className="flex items-center gap-2 border-r border-gray-200 pr-3 mr-1">
              <a href="/api/reviews/export-csv" target="_blank" rel="noreferrer">
                <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all duration-200 shadow-sm">
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              </a>
              <a href="/api/reviews/export-pdf" target="_blank" rel="noreferrer">
                <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all duration-200 shadow-sm">
                  <FileText className="w-4 h-4" />
                  PDF
                </button>
              </a>
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
                  العميل
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  الهاتف
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  الإيميل
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  التاريخ
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  الحالة
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  إجراء
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td className="px-6 py-12 text-center text-gray-500" colSpan={8}>
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <FileText className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">لا توجد طلبات</p>
                        <p className="text-xs text-gray-500">ابدأ بإضافة طلبات جديدة أو استيراد ملف CSV</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((o, index) => {
                  const rowId = o.id; // استخدم document id دائمًا للإرسال
                  const sent = o.reviewSent ?? (o.inviteStatus === 'sent');
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
                        <div className="text-sm text-gray-900">
                          {o.customerName || (
                            <span className="text-gray-400 italic">غير محدد</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 font-mono">
                          {o.phone || (
                            <span className="text-gray-400 italic">غير محدد</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {o.email || (
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
                      <td className="px-6 py-4 text-center">
                        {!sent && rowId ? (
                          <button
                            onClick={() => sendReviewLink(rowId)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            disabled={sendingId === rowId}
                          >
                            {sendingId === rowId ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                يتم الإرسال...
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                إرسال التقييم
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="text-xs text-gray-400">—</div>
                        )}
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
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">تم الإرسال</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {orders.filter(o => o.reviewSent ?? (o.inviteStatus === 'sent')).length}
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
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">في الانتظار</p>
                <p className="text-2xl font-bold text-amber-600">
                  {orders.filter(o => !(o.reviewSent ?? (o.inviteStatus === 'sent'))).length}
                </p>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}