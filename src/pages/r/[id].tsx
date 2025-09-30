// src/pages/r/[id].tsx
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { expandShortLink } from "@/server/short-links";

type Props = object;

export default function RedirectPage({}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // ❌ رابط غير صالح
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4"
      dir="rtl"
    >
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

    // أسرع تحويل ممكن: Redirect من السيرفر (302)
    if (dest) {
      return {
        redirect: {
          destination: dest,
          permanent: false, // 302
        },
      };
    }

    return { props: {} };
  } catch (e) {
    console.error("[r/[id]] error:", e);
    return { props: {} };
  }
};
