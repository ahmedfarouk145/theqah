'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from '@/lib/axiosInstance';
import { isAxiosError } from 'axios';

interface Store {
  id: string;
  name?: string;
  email?: string;
  username?: string;
  connected?: boolean;
  createdAt?: string;
  lastActive?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

interface StoresResponse {
  stores: Store[];
  total: number;
  page: number;
  limit: number;
  hasMore?: boolean;
  nextCursor?: string | null;
}

export default function AdminStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterConnected, setFilterConnected] = useState<'all' | 'connected' | 'disconnected'>('all');

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
        },
      });
      setStores(res.data.stores);
    } catch (error) {
      if (isAxiosError(error)) {
        setError(error.response?.data?.message || 'فشل في تحميل المتاجر');
      } else {
        setError('حدث خطأ غير متوقع');
      }
    } finally {
      setLoading(false);
    }
  }, [searchTerm, sortBy, sortOrder, filterConnected]);

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
      (store.username || '').toLowerCase().includes(s)
    );
  });

  const getConnectionStatus = (connected?: boolean) =>
    connected ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        ✅ متصل
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        ❌ غير متصل
      </span>
    );

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

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
          🏪 المتاجر المسجلة
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="البحث في المتاجر..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <select
            value={filterConnected}
            onChange={(e) => setFilterConnected(e.target.value as 'all' | 'connected' | 'disconnected')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">جميع المتاجر</option>
            <option value="connected">المتصلة فقط</option>
            <option value="disconnected">غير المتصلة فقط</option>
          </select>

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
          <p className="text-gray-600 text-lg">لا توجد متاجر تطابق معايير البحث</p>
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">اسم المستخدم</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">حالة الاتصال</th>
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
                      {store.username ? <span className="font-mono bg-gray-100 px-2 py-1 rounded">@{store.username}</span> : <span className="text-gray-400 italic">غير محدد</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{getConnectionStatus(store.connected)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(store.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">📊</div>
            <div>
              <p className="text-sm font-medium text-blue-600">إجمالي المتاجر</p>
              <p className="text-2xl font-bold text-blue-900">{stores.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">✅</div>
            <div>
              <p className="text-sm font-medium text-green-600">متاجر متصلة</p>
              <p className="text-2xl font-bold text-green-900">{stores.filter((s) => s.connected).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">❌</div>
            <div>
              <p className="text-sm font-medium text-red-600">متاجر غير متصلة</p>
              <p className="text-2xl font-bold text-red-900">{stores.filter((s) => !s.connected).length}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
