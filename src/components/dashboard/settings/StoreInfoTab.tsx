// src/components/dashboard/settings/StoreInfoTab.tsx
'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

export default function StoreInfoTab() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    description: '',
    domain: '',
    logoUrl: '',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await axios.get('/api/store/info');
        setForm(res.data);
      } catch (err) {
        console.error('Error fetching store info', err);
      }
    };
    fetchInfo();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('/api/store/update-info', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error updating store info', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div>
        <label className="block mb-1 font-medium">اسم المتجر</label>
        <input name="name" value={form.name} onChange={handleChange} className="input" />
      </div>

      <div>
        <label className="block mb-1 font-medium">البريد الإلكتروني</label>
        <input name="email" value={form.email} onChange={handleChange} className="input" />
      </div>

      <div>
        <label className="block mb-1 font-medium">رقم الجوال</label>
        <input name="phone" value={form.phone} onChange={handleChange} className="input" />
      </div>

      <div>
        <label className="block mb-1 font-medium">وصف المتجر</label>
        <textarea name="description" value={form.description} onChange={handleChange} className="input h-24" />
      </div>

      <div>
        <label className="block mb-1 font-medium">رابط المتجر</label>
        <input name="domain" value={form.domain} onChange={handleChange} className="input" />
      </div>

      <div>
        <label className="block mb-1 font-medium">رابط الشعار</label>
        <input name="logoUrl" value={form.logoUrl} onChange={handleChange} className="input" />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-green-700 text-white px-6 py-2 rounded hover:bg-green-800"
      >
        {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
      </button>

      {saved && <p className="text-green-600 mt-2">✅ تم الحفظ بنجاح</p>}
    </form>
  );
}
