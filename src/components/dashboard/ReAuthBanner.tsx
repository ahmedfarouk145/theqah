// src/components/dashboard/ReAuthBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from '@/lib/axiosInstance';

const STORAGE_KEY = 'reauth_banner_dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000;

interface ReAuthBannerProps {
  storeUid?: string;
}

export default function ReAuthBanner({ storeUid }: ReAuthBannerProps) {
  const [needsReauth, setNeedsReauth] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dismissedData = localStorage.getItem(STORAGE_KEY);
    if (dismissedData) {
      try {
        const { timestamp } = JSON.parse(dismissedData);
        if (Date.now() - timestamp < DISMISS_DURATION) {
          setDismissed(true);
          setLoading(false);
          return;
        }
      } catch {}
    }

    checkReviewsScope();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeUid]);

  const checkReviewsScope = async () => {
    try {
      const response = await axios.get(`/api/salla/verify?uid=${storeUid || 'default'}`);
      
      const scope = response.data?.store?.salla?.oauth?.scope || 
                    response.data?.tokens?.scope || 
                    '';
      
      const hasReviewsScope = scope.toLowerCase().includes('reviews.read');
      
      if (!hasReviewsScope) {
        setNeedsReauth(true);
      }
    } catch (error) {
      console.error('Failed to check OAuth scopes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      timestamp: Date.now()
    }));
    setDismissed(true);
  };

  const handleReconnect = async () => {
    try {
      const response = await axios.post('/api/salla/connect');
      
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      }
    } catch (error) {
      console.error('Failed to initiate re-authorization:', error);
      alert('حدث خطأ أثناء إعادة الربط. يرجى المحاولة لاحقا.');
    }
  };

  if (loading || dismissed || !needsReauth) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4 mb-6 shadow-lg"
        dir="rtl"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-bold text-amber-900 mb-2">
              يلزم إعادة ربط متجرك
            </h3>
            <p className="text-amber-800 mb-3">
              قمنا بإضافة ميزة جديدة لمزامنة التقييمات من سلة. يرجى إعادة ربط متجرك للاستفادة من هذه الميزة والحصول على الصلاحيات المطلوبة.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleReconnect}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                إعادة الربط الآن
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-amber-900 rounded-lg font-medium transition-colors border border-amber-300"
              >
                تذكيري لاحقا
              </button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-amber-700 hover:text-amber-900 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
