"use client";

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Loader2, ExternalLink, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface RedirectPageProps {
  redirect?: string;
  error?: boolean;
}

export default function RedirectPage({ redirect, error }: RedirectPageProps) {
  const [countdown, setCountdown] = useState(3);
  const [isRedirecting, setIsRedirecting] = useState(!!redirect);

  useEffect(() => {
    if (redirect && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (redirect && countdown === 0) {
      window.location.href = redirect;
    }
  }, [redirect, countdown]);

  useEffect(() => {
    if (redirect) {
      setIsRedirecting(true);
    }
  }, [redirect]);

  if (isRedirecting && redirect) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4" dir="rtl">
        <Head>
          <title>إعادة توجيه…</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        
        <Card className="w-full max-w-md mx-auto shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                جاري إعادة التوجيه…
              </h1>
              <p className="text-gray-600 mb-4">
                سيتم تحويلك خلال {countdown} ثانية
              </p>
            </div>

            <div className="space-y-4">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${((3 - countdown) / 3) * 100}%` }}
                />
              </div>
              
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                <ExternalLink className="w-4 h-4" />
                <span className="truncate max-w-xs" title={redirect}>
                  {redirect}
                </span>
              </div>

              <Button 
                onClick={() => window.location.href = redirect}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                الانتقال الآن
                <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4" dir="rtl">
      <Head>
        <title>رابط غير صالح</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      
      <Card className="w-full max-w-md mx-auto shadow-xl border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              رابط غير صالح
            </h1>
            <p className="text-gray-600 leading-relaxed">
              الرابط الذي تحاول الوصول إليه غير موجود أو انتهت صلاحيته
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-lg p-4">
              <p className="text-sm text-red-700">
                تأكد من صحة الرابط أو تواصل مع الشخص الذي أرسله إليك
              </p>
            </div>
            
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-800 font-medium py-2 px-4 rounded-lg transition-all duration-200"
            >
              العودة إلى الصفحة الرئيسية
              <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}