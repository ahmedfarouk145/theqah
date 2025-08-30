// src/components/dashboard/StoreSettings.tsx
'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Settings,
  Link as LinkIcon,
  MessageSquare,
  Store,
  Sparkles,
  ChevronRight,
  Zap,
  FileText,
} from 'lucide-react';

import ZidIntegrationTab from '@/components/dashboard/settings/ZidIntegrationTab';
import MessageSettings from '@/components/dashboard/settings/MessageSettings';
import SallaIntegrationTab from '@/components/dashboard/settings/SallaIntegrationTab';

type TabMeta = {
  id: 'الربط' | 'الرسائل' | 'معلومات المتجر';
  label: string;
  icon: LucideIcon;
  color: string; // tailwind gradient
  description: string;
};

const settingsTabs: TabMeta[] = [
  {
    id: 'الربط',
    label: 'الربط',
    icon: LinkIcon,
    color: 'from-blue-500 to-blue-600',
    description: 'ربط المتجر مع المنصات',
  },
  {
    id: 'الرسائل',
    label: 'الرسائل',
    icon: MessageSquare,
    color: 'from-emerald-500 to-emerald-600',
    description: 'إعدادات الرسائل والإشعارات',
  },
  {
    id: 'معلومات المتجر',
    label: 'معلومات المتجر',
    icon: Store,
    color: 'from-purple-500 to-purple-600',
    description: 'بيانات المتجر والإعدادات العامة',
  },
];

const TabButton = ({
  tab,
  isActive,
  onClick,
  delay = 0,
}: {
  tab: TabMeta;
  isActive: boolean;
  onClick: () => void;
  delay?: number;
}) => (
  <button
    onClick={onClick}
    className={`group relative overflow-hidden rounded-2xl border transition-all duration-500 transform hover:-translate-y-1 hover:scale-105 ${
      isActive
        ? 'bg-white shadow-2xl border-gray-200/50 scale-105'
        : 'bg-white/60 backdrop-blur-sm border-gray-200/30 hover:bg-white/80 hover:shadow-xl'
    }`}
    style={{
      animationDelay: `${delay}ms`,
      animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      opacity: 0,
      transform: 'translateY(30px)',
    }}
  >
    {/* Animated Background */}
    <div
      className={`absolute inset-0 bg-gradient-to-br ${tab.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}
    />
    {/* Active State Glow */}
    {isActive && <div className={`absolute inset-0 bg-gradient-to-br ${tab.color} opacity-5`} />}

    <div className="relative z-10 p-6 text-center">
      <div
        className={`w-16 h-16 mx-auto mb-4 bg-gradient-to-br ${tab.color} rounded-2xl flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-all duration-300 group-hover:rotate-6 group-hover:scale-110 ${
          isActive ? 'scale-110' : ''
        }`}
      >
        <tab.icon className="w-8 h-8 text-white" />
      </div>

      <h3
        className={`text-lg font-bold mb-2 transition-colors duration-300 ${
          isActive ? 'text-gray-900' : 'text-gray-700 group-hover:text-gray-900'
        }`}
      >
        {tab.label}
      </h3>

      <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
        {tab.description}
      </p>

      {/* Arrow Indicator */}
      <div
        className={`mt-4 flex items-center justify-center transition-all duration-300 ${
          isActive
            ? 'opacity-100 translate-x-0'
            : 'opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
        }`}
      >
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>
    </div>

    {/* Shine Effect */}
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
  </button>
);

const ContentCard = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <div
    className="relative bg-white/90 backdrop-blur-sm rounded-3xl border border-gray-200/50 p-10 shadow-2xl hover:shadow-3xl transition-all duration-700 transform hover:-translate-y-1 overflow-hidden group"
    style={{
      animationDelay: `${delay}ms`,
      animation: 'slideInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      opacity: 0,
      transform: 'translateY(50px) rotateX(5deg)',
      perspective: '1000px',
    }}
  >
    {/* Animated Background */}
    <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-purple-50/20 to-pink-50/30 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
    {/* Floating Orbs */}
    <div className="absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br from-blue-400/10 to-purple-600/10 rounded-full blur-2xl group-hover:scale-150 transition-all duration-1000" />
    <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-tr from-pink-400/10 to-orange-600/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-1000 delay-200" />
    <div className="relative z-10">{children}</div>
  </div>
);

export default function StoreSettings() {
  const [activeTab, setActiveTab] = useState<TabMeta['id']>('الربط');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 p-8 space-y-12">
      {/* Animated Header */}
      <div className="text-center space-y-6 mb-16">
        <div
          className="inline-flex items-center gap-4 px-8 py-4 bg-white/80 backdrop-blur-sm rounded-full shadow-2xl border border-gray-200/50 hover:scale-105 transition-all duration-500 group"
          style={{
            animation: 'slideInDown 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
            opacity: 0,
            transform: 'translateY(-50px)',
          }}
        >
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg group-hover:rotate-12 transition-all duration-300">
            <Settings className="w-6 h-6 text-white animate-spin" style={{ animationDuration: '8s' }} />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            إعدادات المتجر المتقدمة
          </h1>
          <Sparkles className="w-6 h-6 text-purple-500 animate-pulse" />
        </div>
        <p className="text-gray-600 max-w-3xl mx-auto text-lg leading-relaxed">
          تخصيص وإدارة جميع جوانب متجرك الإلكتروني بواجهة حديثة وتفاعلية
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {settingsTabs.map((tab, index) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            delay={index * 100}
          />
        ))}
      </div>

      {/* Tab Content */}
      <ContentCard delay={400}>
        {activeTab === 'الربط' && (
          <div className="space-y-8">
            {/* Header Section */}
            <div className="text-center space-y-4 pb-8 border-b border-gray-200/50">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl hover:rotate-12 hover:scale-110 transition-all duration-500 group">
                <LinkIcon className="w-10 h-10 text-white group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🔗 الربط مع المتجر
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
                يمكنك ربط متجرك بسهولة مع المنصات الرائدة لتحسين تجربة العملاء وزيادة المبيعات
              </p>
            </div>

            {/* Integration Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div
                className="group relative bg-gradient-to-br from-white to-gray-50/50 rounded-2xl border border-gray-200/50 p-8 shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 overflow-hidden"
                style={{
                  animationDelay: '500ms',
                  animation: 'slideInLeft 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                  opacity: 0,
                  transform: 'translateX(-30px)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                    <Zap className="w-6 h-6 text-emerald-600" />
                    منصة سلة
                  </h3>
                  <SallaIntegrationTab />
                </div>
              </div>

              <div
                className="group relative bg-gradient-to-br from-white to-gray-50/50 rounded-2xl border border-gray-200/50 p-8 shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 overflow-hidden"
                style={{
                  animationDelay: '600ms',
                  animation: 'slideInRight 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                  opacity: 0,
                  transform: 'translateX(30px)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                    <Zap className="w-6 h-6 text-blue-600" />
                    منصة زد
                  </h3>
                  <ZidIntegrationTab />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'الرسائل' && (
          <div className="space-y-8">
            {/* Header Section */}
            <div className="text-center space-y-4 pb-8 border-b border-gray-200/50">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl hover:rotate-12 hover:scale-110 transition-all duration-500 group">
                <MessageSquare className="w-10 h-10 text-white group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                ✉️ إعدادات الرسائل
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
                تخصيص رسائل التقييم والإشعارات لتحسين التواصل مع عملائك
              </p>
            </div>

            {/* Message Settings Content */}
            <div
              className="group relative bg-gradient-to-br from-white to-emerald-50/30 rounded-2xl border border-gray-200/50 p-8 shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1 overflow-hidden"
              style={{
                animationDelay: '500ms',
                animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                opacity: 0,
                transform: 'translateY(30px)',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10">
                <MessageSettings />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'معلومات المتجر' && (
          <div className="space-y-8">
            {/* Header Section */}
            <div className="text-center space-y-4 pb-8 border-b border-gray-200/50">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl hover:rotate-12 hover:scale-110 transition-all duration-500 group">
                <Store className="w-10 h-10 text-white group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                📄 معلومات المتجر
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
                إدارة بيانات المتجر الأساسية والإعدادات العامة
              </p>
            </div>

            {/* Store Info Content */}
            <div
              className="group relative bg-gradient-to-br from-white to-purple-50/30 rounded-2xl border border-gray-200/50 p-12 shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1 overflow-hidden text-center"
              style={{
                animationDelay: '500ms',
                animation: 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                opacity: 0,
                transform: 'translateY(30px)',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Floating Elements */}
              <div className="absolute top-8 left-8 w-16 h-16 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-xl group-hover:scale-150 transition-all duration-1000" />
              <div className="absolute bottom-8 right-8 w-12 h-12 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-xl group-hover:scale-125 transition-all duration-1000 delay-200" />

              <div className="relative z-10 space-y-6">
                <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-2xl group-hover:rotate-12 group-hover:scale-110 transition-all duration-500">
                  <Sparkles className="w-12 h-12 text-white animate-pulse" />
                </div>

                <div className="space-y-3">
                  <h3 className="text-2xl font-bold text-gray-900">قريباً...</h3>
                  <p className="text-gray-600 text-lg leading-relaxed max-w-md mx-auto">
                    الاسم، البريد، روابط الدعم، الشروط والسياسات، وإعدادات متقدمة أخرى
                  </p>
                </div>

                {/* Feature Preview Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                  {[
                    { label: 'معلومات الاتصال', icon: MessageSquare },
                    { label: 'روابط الدعم', icon: LinkIcon },
                    { label: 'الشروط والأحكام', icon: FileText },
                    { label: 'إعدادات متقدمة', icon: Settings },
                  ].map((item, index) => (
                    <div
                      key={item.label}
                      className="bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/30 p-4 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 group/item"
                      style={{
                        animationDelay: `${700 + index * 100}ms`,
                        animation: 'slideInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                        opacity: 0,
                        transform: 'translateY(20px)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 rounded-lg flex items-center justify-center shadow-md group-hover/item:rotate-6 group-hover/item:scale-110 transition-all duration-300">
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-sm font-medium text-gray-700 group-hover/item:text-gray-900 transition-colors">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </ContentCard>

      <style jsx>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(50px) rotateX(10deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotateX(0deg);
          }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-50px) rotateX(-10deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotateX(0deg);
          }
        }

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-50px) rotateY(10deg);
          }
          to {
            opacity: 1;
            transform: translateX(0) rotateY(0deg);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(50px) rotateY(-10deg);
          }
          to {
            opacity: 1;
            transform: translateX(0) rotateY(0deg);
          }
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-15px) rotate(3deg);
          }
        }

        @keyframes glow-pulse {
          0%,
          100% {
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
          }
          50% {
            box-shadow: 0 0 40px rgba(59, 130, 246, 0.6), 0 0 60px rgba(147, 51, 234, 0.3);
          }
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-glow-pulse {
          animation: glow-pulse 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
