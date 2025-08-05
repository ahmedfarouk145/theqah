'use client';

import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Switch } from '@/components/ui/switch'; // تأكد من وجوده أو استبدله بمكون خارجي
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdvancedSettingsTab() {
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    show_reviews_public: true,
    reminder_days: 3,
    negative_alert_threshold: 2,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      const user = getAuth().currentUser;
      if (!user) return;

      const storeRef = doc(db, 'stores', user.uid);
      const snap = await getDoc(storeRef);
      if (snap.exists()) {
        setStoreId(user.uid);
        const data = snap.data();
        setSettings((prev) => ({
          ...prev,
          ...data.app,
        }));
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  type SettingKey = keyof typeof settings;

  const handleChange = (field: SettingKey, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!storeId) return;
    const storeRef = doc(db, 'stores', storeId);
    await setDoc(
      storeRef,
      { app: settings },
      { merge: true }
    );
    alert('تم حفظ الإعدادات بنجاح');
  };

  if (loading) return <p>جاري التحميل...</p>;

  return (
    <div className="space-y-6">
      <div>
        <Label>عرض التقييمات للزوار</Label>
        <Switch
          checked={settings.show_reviews_public}
          onCheckedChange={(v: boolean) => handleChange('show_reviews_public', v)}
        />
      </div>

      <div>
        <Label>أيام التذكير بعد الطلب</Label>
        <Input
          type="number"
          min={1}
          value={settings.reminder_days}
          onChange={(e) => handleChange('reminder_days', parseInt(e.target.value))}
        />
      </div>

      <div>
        <Label>عدد النجوم لإرسال تنبيه للمشرف</Label>
        <Input
          type="number"
          min={1}
          max={4}
          value={settings.negative_alert_threshold}
          onChange={(e) =>
            handleChange('negative_alert_threshold', parseInt(e.target.value))
          }
        />
      </div>

      <button
        onClick={handleSave}
        className="px-6 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800"
      >
        حفظ الإعدادات
      </button>
    </div>
  );
}
