//src/pages/connect/zid.tsx
'use client';

import { useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { motion } from 'framer-motion';
import { Loader2, Zap, CheckCircle } from 'lucide-react';

export default function ConnectZid() {
  useEffect(() => {
    (async () => {
      const auth = getAuth(app);
      const user = auth.currentUser || (await new Promise(resolve => {
        const unsub = auth.onAuthStateChanged(u => { resolve(u); unsub(); });
      }));
      if (!user) { window.location.href = '/login?next=/connect/zid'; return; }
      const idToken = await user.getIdToken();

      const r = await fetch('/api/zid/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const j = await r.json();
      if (r.ok && j.authorizeUrl) window.location.href = j.authorizeUrl;
      else window.location.href = '/dashboard?zid_start_error=1';
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-md w-full bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-2xl p-8 shadow-2xl"
        dir="rtl"
      >
        <div className="text-center space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-xl"
          >
            <Zap className="w-10 h-10 text-white" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="space-y-3"
          >
            <h1 className="text-2xl font-extrabold text-gray-900">بدء ربط منصة زد</h1>
            <p className="text-gray-600 leading-relaxed">
              جارٍ تحويلك إلى صفحة التفويض في زد لإتمام الربط الآمن…
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-center gap-3"
          >
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-blue-600 font-medium">جارٍ الاتصال بزد...</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-blue-50 border border-blue-200 rounded-lg p-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">نصيحة:</p>
                <p>تأكد من تسجيل الدخول في حساب زد الخاص بك في نفس المتصفح</p>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
