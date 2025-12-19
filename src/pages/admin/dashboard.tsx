// src/pages/admin/dashboard.tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

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
const TestNotifyTab = dynamic(() => import('@/components/admin/tabs/TestNotifyTab'), {
  loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>,
  ssr: false
});

const adminTabs = [
  'مراجعة التقييمات',
  'بلاغات التقييمات',
  'المتاجر',
  'الإحصائيات العامة',
  'إدارة الاشتراكات',
  'اختبار القنوات',
] as const;

type Tab = typeof adminTabs[number];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>(adminTabs[0]);

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <h1 className="text-3xl font-bold mb-6 text-green-800">لوحة تحكم المشرف</h1>

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
        {activeTab === 'المتاجر' && <AdminStores />}
        {activeTab === 'الإحصائيات العامة' && <AdminAnalytics />}
        {activeTab === 'إدارة الاشتراكات' && <AdminSubscriptions />}
        {activeTab === 'اختبار القنوات' && <TestNotifyTab />}
      </div>
    </div>
  );
}
