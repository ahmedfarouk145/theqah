// src/components/dashboard/UsageCounter.tsx
'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { TrendingUp, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

type UsageData = {
  invitesUsed: number;
  invitesLimit: number;
  percentage: number;
  monthKey: string;
  planCode: string;
  planName: string;
  status: "safe" | "warning" | "critical" | "exceeded";
};

export default function UsageCounter() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const response = await axios.get('/api/usage/current');
        if (response.data.ok) {
          setUsage(response.data.usage);
        } else {
          setError(response.data.message || 'فشل في جلب البيانات');
        }
      } catch {
        setError('حدث خطأ في الاتصال');
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-3"></div>
        <div className="h-2 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  if (error || !usage) {
    return null; // أو يمكن عرض رسالة خطأ بسيطة
  }

  // تحديد الألوان حسب الحالة
  const statusConfig = {
    safe: {
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: CheckCircle,
      message: 'الاستهلاك ضمن الحد الآمن',
    },
    warning: {
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      icon: AlertTriangle,
      message: 'اقتربت من حد الباقة',
    },
    critical: {
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      icon: AlertCircle,
      message: 'وشكت توصل للحد الأقصى!',
    },
    exceeded: {
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: AlertCircle,
      message: 'وصلت للحد الأقصى - جدد الباقة',
    },
  };

  const config = statusConfig[usage.status];
  const Icon = config.icon;
  const remaining = Math.max(0, usage.invitesLimit - usage.invitesUsed);

  return (
    <div 
      className={`relative overflow-hidden bg-white rounded-2xl border ${config.borderColor} shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1`}
    >
      {/* Background gradient */}
      <div className={`absolute inset-0 ${config.bgColor} opacity-30`}></div>
      
      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 ${config.color} rounded-xl flex items-center justify-center shadow-lg`}>
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-600">استهلاك التقييمات</h3>
              <p className="text-xs text-gray-500">{usage.planName}</p>
            </div>
          </div>
          <Icon className={`w-6 h-6 ${config.textColor}`} />
        </div>

        {/* Usage Numbers */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-3xl font-bold text-gray-900">{usage.invitesUsed}</span>
              <span className="text-lg text-gray-500 mr-1">/ {usage.invitesLimit}</span>
            </div>
            <div className={`text-2xl font-bold ${config.textColor}`}>
              {usage.percentage}%
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${config.color} transition-all duration-500 rounded-full`}
              style={{ width: `${Math.min(usage.percentage, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Status Message */}
        <div className={`flex items-center gap-2 ${config.textColor} text-sm font-medium`}>
          <div className={`w-2 h-2 ${config.color} rounded-full animate-pulse`}></div>
          {config.message}
          {usage.status !== 'exceeded' && (
            <span className="mr-auto text-gray-600">({remaining} متبقي)</span>
          )}
        </div>

        {/* Exceeded warning */}
        {usage.status === 'exceeded' && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700">
              ⚠️ لن يتم إرسال دعوات جديدة حتى تجديد الباقة أو بداية الشهر الجديد
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
