// src/pages/admin/dashboard.tsx
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Loader2, LogOut } from 'lucide-react';
import { logoutUser } from '@/lib/auth/login';

// Dynamic imports for all admin components - reduces initial bundle
const AdminReviews = dynamic(() => import('@/components/admin/AdminReviews'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>,
  ssr: false
});
const AdminReports = dynamic(() => import('@/components/admin/AdminReports'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>,
  ssr: false
});
const AdminStores = dynamic(() => import('@/components/admin/AdminStores'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>,
  ssr: false
});
const AdminAnalytics = dynamic(() => import('@/components/admin/AdminAnalytics'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>,
  ssr: false
});
const AdminSubscriptions = dynamic(() => import('@/components/admin/AdminSubscriptions'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>,
  ssr: false
});
const AdminMonitoring = dynamic(() => import('@/components/admin/AdminMonitoring'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>,
  ssr: false
});


const adminTabs = [
  'مراجعة التقييمات',
  'بلاغات التقييمات',
  'متاجر سلة',
  'متاجر زد',
  'سجلات غير مصنفة',
  'الإحصائيات العامة',
  'إدارة الاشتراكات',
  'المراقبة',
] as const;

type Tab = typeof adminTabs[number];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>(adminTabs[0]);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      await logoutUser();
      router.push('/login');
    } catch (e) {
      console.error('Logout failed:', e);
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-green-800">لوحة تحكم المشرف</h1>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition font-medium text-sm disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          {loggingOut ? 'جارٍ الخروج…' : 'تسجيل الخروج'}
        </button>
      </div>

      {/* Tabs with fixed height to prevent CLS */}
      <div className="flex space-x-2 mb-6 rtl:space-x-reverse min-h-[44px]">
        {adminTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md font-medium border transition text-sm ${activeTab === tab
              ? 'bg-green-700 text-white border-green-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content area with min-height to prevent CLS */}
      <div className="bg-white p-6 rounded-xl shadow min-h-[400px]">
        {activeTab === 'مراجعة التقييمات' && <AdminReviews />}
        {activeTab === 'بلاغات التقييمات' && <AdminReports />}
        {activeTab === 'متاجر سلة' && <AdminStores provider="salla" />}
        {activeTab === 'متاجر زد' && <AdminStores provider="zid" />}
        {activeTab === 'سجلات غير مصنفة' && <AdminStores provider="unknown" />}
        {activeTab === 'الإحصائيات العامة' && <AdminAnalytics />}
        {activeTab === 'إدارة الاشتراكات' && <AdminSubscriptions />}
        {activeTab === 'المراقبة' && <AdminMonitoring />}

      </div>
    </div>
  );
}
