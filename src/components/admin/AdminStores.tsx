'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from '@/lib/axiosInstance';
import { isAxiosError } from 'axios';

interface Store {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  username?: string;
  domain?: string;
  connected?: boolean;
  expiresAt?: string;
  planId?: string | null;
  planActive?: boolean;
  subscriptionBucket?: 'trial' | 'monthly' | 'yearly' | 'cancelled' | 'unknown';
  createdAt?: string;
  lastActive?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

interface StoreSummary {
  totalStores: number;
  connectedStores: number;
  disconnectedStores: number;
  paidSubscribers: number;
  activeIncludingTrial: number;
  cancelledOrExpired: number;
  unknownSubscriptions: number;
}

interface StoresResponse {
  stores: Store[];
  total: number;
  page: number;
  limit: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  summary?: StoreSummary;
}

type AdminStoresProps = {
  provider?: 'salla' | 'zid' | 'unknown';
};

export default function AdminStores({ provider }: AdminStoresProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [summary, setSummary] = useState<StoreSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterConnected, setFilterConnected] = useState<'all' | 'connected' | 'disconnected'>('all');
  const providerLabel =
    provider === 'zid'
      ? 'زد'
      : provider === 'salla'
        ? 'سلة'
        : provider === 'unknown'
          ? 'غير المصنفة'
          : 'جميع';
  const showTechnicalConnectionControls = !provider;

  const fetchStores = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await axios.get<StoresResponse>('/api/admin/stores', {
        params: {
          search: searchTerm || undefined,
          sortBy,
          sortOrder,
          filterConnected: filterConnected !== 'all' ? filterConnected : undefined,
          provider,
        },
      });
      setStores(res.data.stores);
      setSummary(res.data.summary ?? null);
    } catch (error) {
      if (isAxiosError(error)) {
        setError(error.response?.data?.message || 'فشل في تحميل المتاجر');
      } else {
        setError('حدث خطأ غير متوقع');
      }
      setSummary(null);
    } finally {
        setLoading(false);
      }
  }, [searchTerm, sortBy, sortOrder, filterConnected, provider]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const handleRefresh = () => fetchStores();

  const handleSort = (column: 'name' | 'email' | 'createdAt') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const filteredStores = stores.filter((store) => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (
      (store.name || '').toLowerCase().includes(s) ||
      (store.email || '').toLowerCase().includes(s) ||
      (store.username || '').toLowerCase().includes(s) ||
      (store.phone || '').toLowerCase().includes(s) ||
      (store.domain || '').toLowerCase().includes(s)
    );
  });

  const getSubscriptionStatus = (bucket?: Store['subscriptionBucket']) => {
    switch (bucket) {
      case 'monthly':
      case 'yearly':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            ✅ نشط مدفوع
          </span>
        );
      case 'trial':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            🟡 تجريبي
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
            ⛔ ملغي / منتهي
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            ❔ غير مكتمل
          </span>
        );
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDomainHref = (domain?: string) => {
    if (!domain) return undefined;
    return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const fallbackSummary: StoreSummary = {
    totalStores: stores.length,
    connectedStores: stores.filter((store) => store.connected).length,
    disconnectedStores: stores.filter((store) => !store.connected).length,
    paidSubscribers: stores.filter(
      (store) =>
        store.subscriptionBucket === 'monthly' ||
        store.subscriptionBucket === 'yearly',
    ).length,
    activeIncludingTrial: stores.filter(
      (store) =>
        store.subscriptionBucket === 'trial' ||
        store.subscriptionBucket === 'monthly' ||
        store.subscriptionBucket === 'yearly',
    ).length,
    cancelledOrExpired: stores.filter(
      (store) => store.subscriptionBucket === 'cancelled',
    ).length,
    unknownSubscriptions: stores.filter(
      (store) => store.subscriptionBucket === 'unknown',
    ).length,
  };
  const cardSummary = summary ?? fallbackSummary;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        <p className="mr-3 text-gray-600">جارٍ التحميل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-green-800 flex items-center">
          🏪 {provider ? `متاجر ${providerLabel}` : 'المتاجر المسجلة'}
          <span className="mr-2 text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {filteredStores.length}
          </span>
        </h2>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
        >
          🔄 تحديث
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div className={`grid grid-cols-1 gap-4 ${showTechnicalConnectionControls ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <input
            type="text"
            placeholder={provider ? `البحث في متاجر ${providerLabel}...` : 'البحث في المتاجر...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          {showTechnicalConnectionControls && (
            <select
              value={filterConnected}
              onChange={(e) => setFilterConnected(e.target.value as 'all' | 'connected' | 'disconnected')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">جميع المتاجر</option>
              <option value="connected">المربوطة تقنياً فقط</option>
              <option value="disconnected">غير المربوطة تقنياً فقط</option>
            </select>
          )}

          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'email' | 'createdAt')}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="createdAt">تاريخ التسجيل</option>
              <option value="name">الاسم</option>
              <option value="email">البريد</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={handleRefresh} className="text-red-800 hover:text-red-900 underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {filteredStores.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <div className="text-6xl mb-4">🏪</div>
          <p className="text-gray-600 text-lg">
            {provider ? `لا توجد متاجر ${providerLabel} تطابق معايير البحث` : 'لا توجد متاجر تطابق معايير البحث'}
          </p>
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="mt-2 text-green-600 hover:text-green-700 underline">
              مسح البحث
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('name')}
                  >
                    اسم المتجر {getSortIcon('name')}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('email')}
                  >
                    البريد الإلكتروني {getSortIcon('email')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الهاتف</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الدومين</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">اسم المستخدم</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">حالة الاشتراك</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">تاريخ الانتهاء</th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('createdAt')}
                  >
                    تاريخ التسجيل {getSortIcon('createdAt')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStores.map((store, index) => (
                  <tr key={store.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{store.id.slice(0, 8)}...</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {store.name ? <span className="font-medium">{store.name}</span> : <span className="text-gray-400 italic">غير محدد</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {store.email ? (
                        <a href={`mailto:${store.email}`} className="text-blue-600 hover:text-blue-800 underline">
                          {store.email}
                        </a>
                      ) : (
                        <span className="text-gray-400 italic">غير محدد</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {store.phone ? (
                        <a href={`tel:${store.phone}`} className="text-blue-600 hover:text-blue-800 underline">
                          {store.phone}
                        </a>
                      ) : (
                        <span className="text-gray-400 italic">غير محدد</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {store.domain ? (
                        <a
                          href={formatDomainHref(store.domain)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          {store.domain}
                        </a>
                      ) : (
                        <span className="text-gray-400 italic">غير محدد</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {store.username ? <span className="font-mono bg-gray-100 px-2 py-1 rounded">@{store.username}</span> : <span className="text-gray-400 italic">غير محدد</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{getSubscriptionStatus(store.subscriptionBucket)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(store.expiresAt)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(store.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">📊</div>
            <div>
              <p className="text-sm font-medium text-blue-600">
                {provider ? `إجمالي متاجر ${providerLabel}` : 'إجمالي المتاجر'}
              </p>
              <p className="text-2xl font-bold text-blue-900">{cardSummary.totalStores}</p>
            </div>
          </div>
        </div>
        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">💳</div>
            <div>
              <p className="text-sm font-medium text-emerald-600">
                {provider ? `مشتركو ${providerLabel} المدفوعون` : 'المشتركون المدفوعون'}
              </p>
              <p className="text-2xl font-bold text-emerald-900">{cardSummary.paidSubscribers}</p>
            </div>
          </div>
        </div>
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">🟡</div>
            <div>
              <p className="text-sm font-medium text-amber-700">
                {provider ? `نشطة ${providerLabel} مع التجريبي` : 'النشطة مع التجريبي'}
              </p>
              <p className="text-2xl font-bold text-amber-900">{cardSummary.activeIncludingTrial}</p>
            </div>
          </div>
        </div>
        <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">⛔</div>
            <div>
              <p className="text-sm font-medium text-rose-700">
                {provider ? `ملغاة / منتهية ${providerLabel}` : 'الملغاة / المنتهية'}
              </p>
              <p className="text-2xl font-bold text-rose-900">{cardSummary.cancelledOrExpired}</p>
            </div>
          </div>
        </div>
      </div>

      {showTechnicalConnectionControls && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          الربط التقني مع المنصة: {cardSummary.connectedStores} متصل، {cardSummary.disconnectedStores} غير متصل.
          {cardSummary.unknownSubscriptions > 0 ? ` يوجد ${cardSummary.unknownSubscriptions} متجر ببيانات اشتراك غير مكتملة.` : ''}
        </div>
      )}
    </div>
  );
}
