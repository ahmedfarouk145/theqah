import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/router";
import { app } from "@/lib/firebase";

const AdminLogin: NextPage = () => {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setAuthLoading(false);
      return;
    }

    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthLoading(false);
      if (user) {
        router.replace("/admin/dashboard");
      }
    });

    return unsubscribe;
  }, [router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">تسجيل دخول المشرف</h1>
          <p className="text-gray-600 mt-2">لوحة المشرف تستخدم نفس تسجيل الدخول الأساسي للتطبيق.</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 leading-6">
              تم إيقاف تسجيل الدخول بواسطة <code>ADMIN_SECRET</code> داخل المتصفح.
              استخدم حساب Firebase الذي يملك صلاحيات المشرف، ثم ادخل إلى لوحة المشرف مباشرة.
            </p>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              الذهاب إلى تسجيل الدخول
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/dashboard")}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
            >
              فتح لوحة المشرف بعد تسجيل الدخول
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              الدخول الآن يعتمد على جلسة Firebase وصلاحيات المشرف في الخادم.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
