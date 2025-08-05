'use client';

import { useState } from 'react';
import StoreIntegration from '@/components/dashboard/settings/SallaIntegrationTab';
import MessageSettings from '@/components/dashboard/settings/MessageSettings';
import StoreAppearanceSettings from '@/components/dashboard/settings/StoreAppearanceSettings';
import AdvancedSettings from '@/components/dashboard/settings/AdvancedSettings';

const settingsTabs = ['الربط', 'الرسائل', 'المظهر', 'معلومات المتجر', 'الإعدادات المتقدمة'];

export default function StoreSettings() {
  const [activeTab, setActiveTab] = useState('الربط');

  return (
    <div>
      {/* Tabs Navigation */}
      <div className="flex space-x-2 mb-4 rtl:space-x-reverse">
        {settingsTabs.map((tab) => (
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

      {/* Tab Content */}
      <div className="bg-gray-50 p-6 rounded-xl border space-y-10">
        {activeTab === 'الربط' && (
          <div>
            <h2 className="text-xl font-bold mb-4 text-green-800">🔗 الربط مع المتجر</h2>
            <StoreIntegration />
          </div>
        )}

        {activeTab === 'الرسائل' && (
          <div>
            <h2 className="text-xl font-bold mb-4 text-green-800">✉️ إعدادات الرسائل</h2>
            <MessageSettings />
          </div>
        )}

        {activeTab === 'المظهر' && (
          <div>
            <h2 className="text-xl font-bold mb-4 text-green-800">🎨 المظهر</h2>
            <StoreAppearanceSettings />
          </div>
        )}

        {activeTab === 'معلومات المتجر' && (
          <div>
            <h2 className="text-xl font-bold mb-4 text-green-800">📄 معلومات المتجر</h2>
            <p>الاسم، البريد، الدعم، روابط الشروط والسياسة.</p>
          </div>
        )}

        {activeTab === 'الإعدادات المتقدمة' && (
          <div>
            <h2 className="text-xl font-bold mb-4 text-green-800">⚙️ الإعدادات المتقدمة</h2>
            <AdvancedSettings />
          </div>
        )}
      </div>
    </div>
  );
}
