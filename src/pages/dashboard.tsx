import { useState } from 'react';
import DashboardAnalytics from '@/components/dashboard/Analytics';
import OrdersTab from '@/components/dashboard/OrdersTab';
import ReviewsTab from '@/components/dashboard/Reviews';
import SettingsTab from '@/components/dashboard/StoreSettings';
import SupportTab from '@/components/dashboard/Support';
import { useAuth } from '@/contexts/AuthContext';

const tabs = ['الإحصائيات', 'الطلبات', 'التقييمات', 'الإعدادات', 'المساعدة'];

export default function DashboardPage() {
  const { storeName, loading } = useAuth(); // ✅ أضف loading
  const [activeTab, setActiveTab] = useState('الإحصائيات');

  // ✅ إظهار رسالة فقط إذا كان جاري التحميل
  if (loading) return <p>جارٍ تحميل بيانات المتجر...</p>;

  // ✅ التحقق من وجود اسم المتجر بعد التحميل
  if (!storeName) return <p className="text-red-600">لم يتم العثور على المتجر!</p>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold mb-6 text-green-800">لوحة التحكم</h1>

      <div className="flex space-x-2 mb-6 rtl:space-x-reverse">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md font-medium border transition ${
              activeTab === tab
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        {activeTab === 'الإحصائيات' && <DashboardAnalytics />}
        {activeTab === 'الطلبات' && <OrdersTab />}
        {activeTab === 'التقييمات' && <ReviewsTab storeName={storeName} />}
        {activeTab === 'الإعدادات' && <SettingsTab />}
        {activeTab === 'المساعدة' && <SupportTab />}
      </div>
    </div>
  );
}
