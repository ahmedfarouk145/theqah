'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { useAuth } from '@/contexts/AuthContext';

export default function MessageSettings() {
  const { token } = useAuth();
  const [senderName, setSenderName] = useState('');
  const [defaultMethod, setDefaultMethod] = useState('whatsapp');
  const [smsTemplate, setSmsTemplate] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/store/app-settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const app = res.data.app || {};
        setSenderName(app.sender_name || '');
        setDefaultMethod(app.default_send_method || 'whatsapp');
        setSmsTemplate(app.sms_template || '');
        setWhatsappTemplate(app.whatsapp_template || '');
        setEmailTemplate(app.email_template || '');
      } catch (err) {
        console.error('Error loading settings:', err);
        setError('تعذر تحميل الإعدادات.');
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchSettings();
  }, [token]);

  const handleSave = async () => {
    try {
      await axios.post('/api/store/app-settings', {
        sender_name: senderName,
        default_send_method: defaultMethod,
        sms_template: smsTemplate,
        whatsapp_template: whatsappTemplate,
        email_template: emailTemplate,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Error saving:', err);
      setError('تعذر حفظ الإعدادات.');
    }
  };

  if (loading) return <p>جارٍ تحميل الإعدادات...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold mb-4">إعدادات الرسائل</h2>

      <div>
        <label className="block text-sm font-medium mb-1">اسم المرسل</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">طريقة الإرسال الافتراضية</label>
        <select
          className="w-full border rounded px-3 py-2"
          value={defaultMethod}
          onChange={(e) => setDefaultMethod(e.target.value)}
        >
          <option value="whatsapp">واتساب</option>
          <option value="sms">رسالة SMS</option>
          <option value="email">بريد إلكتروني</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">نص رسالة SMS</label>
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          value={smsTemplate}
          onChange={(e) => setSmsTemplate(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">نص رسالة WhatsApp</label>
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          value={whatsappTemplate}
          onChange={(e) => setWhatsappTemplate(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">نص رسالة البريد الإلكتروني</label>
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          value={emailTemplate}
          onChange={(e) => setEmailTemplate(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        className="px-5 py-2 bg-green-700 text-white rounded hover:bg-green-800"
      >
        حفظ التغييرات
      </button>

      {saved && <p className="text-green-600">تم الحفظ بنجاح ✅</p>}
    </div>
  );
}
