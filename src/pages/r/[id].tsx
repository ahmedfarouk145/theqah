// src/pages/r/[id].tsx
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { expandShortLink } from "@/server/short-links";
import { Loader2, ExternalLink, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = { redirect?: string };

export default function RedirectPage({
  redirect,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!redirect) return;
    if (countdown === 0) {
      window.location.href = redirect;
      return;
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [redirect, countdown]);

  if (redirect) {
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
              <h1 className="text-2xl font-bold text-gray-800 mb-2">جاري إعادة التوجيه…</h1>
              <p className="text-gray-600 mb-4">سيتم تحويلك خلال {countdown} ثانية</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                <ExternalLink className="w-4 h-4" />
                <span className="truncate max-w-xs" title={redirect}>
                  {redirect}
                </span>
              </div>
              <Button
                onClick={() => (window.location.href = redirect)}
                className="w-full"
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

  // ❌ رابط غير صالح
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
            <h1 className="text-2xl font-bold text-gray-800 mb-2">رابط غير صالح</h1>
            <p className="text-gray-600">
              الرابط الذي تحاول الوصول إليه غير موجود أو انتهت صلاحيته
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => (window.location.href = "/")}
          >
            العودة إلى الصفحة الرئيسية
            <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = typeof ctx.params?.id === "string" ? ctx.params.id.trim() : "";
  ctx.res.setHeader("Cache-Control", "no-store");
  if (!id) return { props: {} };

  try {
    const dest = await expandShortLink(id);
    return { props: dest ? { redirect: dest } : {} };
  } catch (e) {
    console.error("[r/[id]] error:", e);
    return { props: {} };
  }
};
