"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function DashboardIntegrationsRedirect() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(true);

  const handleRedirect = () => {
    setIsRedirecting(false);
    setTimeout(() => {
      router.replace("/dashboard?salla=connected");
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
      
      {/* Floating Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-400/10 rounded-full blur-xl animate-float"></div>
        <div className="absolute top-3/4 right-1/4 w-48 h-48 bg-purple-400/10 rounded-full blur-xl animate-float-delayed"></div>
        <div className="absolute bottom-1/4 left-1/3 w-40 h-40 bg-pink-400/10 rounded-full blur-xl animate-float-slow"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-12 border border-white/20 max-w-md w-full text-center">
        <div className="space-y-8">
          {/* Logo/Icon Area */}
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          <LoadingSpinner onComplete={handleRedirect} duration={3000} />

          {/* Additional Info */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              سيتم توجيهك تلقائياً خلال لحظات
            </p>
            <div className="flex justify-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
              <div className="w-2 h-2 bg-pink-400 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}