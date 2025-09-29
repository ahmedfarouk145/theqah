// src/pages/admin/dashboard.tsx
'use client';

import { useState } from 'react';
import AdminReviews from '@/components/admin/AdminReviews';
import AdminReports from '@/components/admin/AdminReports';
import AdminStores from '@/components/admin/AdminStores';
import AdminAnalytics from '@/components/admin/AdminAnalytics';
import TestNotifyTab from '@/components/admin/tabs/TestNotifyTab';
import AdminSubscriptions from '@/components/admin/AdminSubscriptions'; // ← جديد

const adminTabs = [
  'مراجعة التقييمات',
  'بلاغات التقييمات',
  'المتاجر',
  'الإحصائيات العامة',
  'إدارة الاشتراكات', // ← جديد
  'اختبار القنوات',
] as const;

type Tab = typeof adminTabs[number];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>(adminTabs[0]);

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <h1 className="text-3xl font-bold mb-6 text-green-800">لوحة تحكم المشرف</h1>

      <div className="flex space-x-2 mb-6 rtl:space-x-reverse">
        {adminTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md font-medium border transition text-sm ${
              activeTab === tab
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        {activeTab === 'مراجعة التقييمات' && <AdminReviews />}
        {activeTab === 'بلاغات التقييمات' && <AdminReports />}
        {activeTab === 'المتاجر' && <AdminStores />}
        {activeTab === 'الإحصائيات العامة' && <AdminAnalytics />}
        {activeTab === 'إدارة الاشتراكات' && <AdminSubscriptions />}{/* ← جديد */}
        {activeTab === 'اختبار القنوات' && <TestNotifyTab />}
      </div>
    </div>
  );
}
