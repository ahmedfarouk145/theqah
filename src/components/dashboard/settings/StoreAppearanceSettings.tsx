'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

export default function StoreAppearanceSettings() {
  const [primaryColor, setPrimaryColor] = useState('#16a34a');
  const [logoUrl, setLogoUrl] = useState('');
  const [introText, setIntroText] = useState('');
  const [thankYouMsg, setThankYouMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get('/api/store/app-settings');
        const app = res.data.app || {};
        setPrimaryColor(app.primary_color || '#16a34a');
        setLogoUrl(app.store_logo_url || '');
        setIntroText(app.store_intro_richtext || '');
        setThankYouMsg(app.thank_you_message || '');
      } catch (err) {
        console.error(err);
      }
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post('/api/store/app-settings', {
        primary_color: primaryColor,
        store_logo_url: logoUrl,
        store_intro_richtext: introText,
        thank_you_message: thankYouMsg,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">إعدادات المظهر</h2>

      <div>
        <label className="block font-medium text-sm mb-1">اللون الأساسي</label>
        <input
          type="color"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
        />
      </div>

      <div>
        <label className="block font-medium text-sm mb-1">رابط شعار المتجر</label>
        <input
          type="url"
          className="w-full border px-3 py-2 rounded"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
        />
      </div>

      <div>
        <label className="block font-medium text-sm mb-1">نص الترحيب أعلى التقييمات</label>
        <textarea
          rows={2}
          className="w-full border px-3 py-2 rounded"
          value={introText}
          onChange={(e) => setIntroText(e.target.value)}
        />
      </div>

      <div>
        <label className="block font-medium text-sm mb-1">رسالة الشكر بعد التقييم</label>
        <textarea
          rows={2}
          className="w-full border px-3 py-2 rounded"
          value={thankYouMsg}
          onChange={(e) => setThankYouMsg(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800"
      >
        {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
      </button>

      {saved && <p className="text-green-600">✅ تم الحفظ</p>}
    </div>
  );
}
