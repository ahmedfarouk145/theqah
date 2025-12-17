// src/components/dashboard/settings/MessageSettings.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import axios from '@/lib/axiosInstance';
import { useAuth } from '@/contexts/AuthContext';

export default function MessageSettings() {
  const { user } = useAuth();
  const [senderName, setSenderName] = useState('');
  const [defaultMethod, setDefaultMethod] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp');
  const [smsTemplate, setSmsTemplate] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      setError('');
      setLoading(true);

      if (!user) {
        throw new Error('UNAUTHENTICATED');
      }
      const idToken = await user.getIdToken(true);

      const res = await axios.get('/api/store/app-settings', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const appCfg = res.data?.app ?? {};
      if (!mountedRef.current) return;

      setSenderName(appCfg.sender_name || '');
      setDefaultMethod((appCfg.default_send_method as 'whatsapp' | 'sms' | 'email') || 'whatsapp');
      setSmsTemplate(appCfg.sms_template || '');
      setWhatsappTemplate(appCfg.whatsapp_template || '');
      setEmailTemplate(appCfg.email_template || '');
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(
        (e as Error)?.message === 'UNAUTHENTICATED'
          ? 'غير مصرح: الرجاء تسجيل الدخول.'
          : 'تعذر تحميل الإعدادات.'
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = useCallback(async () => {
    try {
      setError('');
      setSaving(true);

      if (!user) {
        throw new Error('UNAUTHENTICATED');
      }
      const idToken = await user.getIdToken(true);

      await axios.post(
        '/api/store/app-settings',
        {
          sender_name: senderName,
          default_send_method: defaultMethod,
          sms_template: smsTemplate,
          whatsapp_template: whatsappTemplate,
          email_template: emailTemplate,
        },
        { headers: { Authorization: `Bearer ${idToken}` } }
      );

      if (!mountedRef.current) return;
      setSaved(true);
      setTimeout(() => mountedRef.current && setSaved(false), 2000);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(
        (e as Error)?.message === 'UNAUTHENTICATED'
          ? 'غير مصرح: الرجاء تسجيل الدخول.'
          : 'تعذر حفظ الإعدادات.'
      );
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [user, senderName, defaultMethod, smsTemplate, whatsappTemplate, emailTemplate]);

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
          onChange={(e) => setDefaultMethod(e.target.value as 'whatsapp' | 'sms' | 'email')}
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
        disabled={saving}
        className={`px-5 py-2 text-white rounded ${saving ? 'bg-green-400 cursor-not-allowed' : 'bg-green-700 hover:bg-green-800'}`}
      >
        {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
      </button>

      {saved && <p className="text-green-600">تم الحفظ بنجاح ✅</p>}
    </div>
  );
}
