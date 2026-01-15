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
      } catch {
        // Error fetching store info - silently handled
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
    } catch {
      // Error updating store info - silently handled
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl" aria-label="معلومات المتجر">
      <div>
        <label htmlFor="store-name" className="block mb-1 font-medium">اسم المتجر</label>
        <input 
          id="store-name"
          name="name" 
          value={form.name} 
          onChange={handleChange} 
          className="input" 
          aria-label="اسم المتجر"
        />
      </div>

      <div>
        <label htmlFor="store-email" className="block mb-1 font-medium">البريد الإلكتروني</label>
        <input 
          id="store-email"
          name="email" 
          type="email"
          value={form.email} 
          onChange={handleChange} 
          className="input" 
          aria-label="البريد الإلكتروني"
        />
      </div>

      <div>
        <label htmlFor="store-phone" className="block mb-1 font-medium">رقم الجوال</label>
        <input 
          id="store-phone"
          name="phone" 
          type="tel"
          value={form.phone} 
          onChange={handleChange} 
          className="input" 
          aria-label="رقم الجوال"
        />
      </div>

      <div>
        <label htmlFor="store-description" className="block mb-1 font-medium">وصف المتجر</label>
        <textarea 
          id="store-description"
          name="description" 
          value={form.description} 
          onChange={handleChange} 
          className="input h-24" 
          aria-label="وصف المتجر"
        />
      </div>

      <div>
        <label htmlFor="store-domain" className="block mb-1 font-medium">رابط المتجر</label>
        <input 
          id="store-domain"
          name="domain" 
          type="url"
          value={form.domain} 
          onChange={handleChange} 
          className="input" 
          aria-label="رابط المتجر"
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label htmlFor="store-logo" className="block mb-1 font-medium">رابط الشعار</label>
        <input 
          id="store-logo"
          name="logoUrl" 
          type="url"
          value={form.logoUrl} 
          onChange={handleChange} 
          className="input" 
          aria-label="رابط الشعار"
          placeholder="https://example.com/logo.png"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-green-700 text-white px-6 py-2 rounded hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="حفظ معلومات المتجر"
        aria-busy={loading}
      >
        {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
      </button>

      {saved && <p className="text-green-600 mt-2" role="status" aria-live="polite">✅ تم الحفظ بنجاح</p>}
    </form>
  );
}
