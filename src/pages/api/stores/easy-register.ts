// src/pages/api/stores/easy-register.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { sendPasswordSetupEmail } from "@/server/auth/send-password-email";

interface EasyRegisterRequest {
  merchantEmail: string;
  storeName: string;
  storeUrl: string; // URL المتجر (سالة)
  merchantId?: string; // اختياري - من سالة
}

interface EasyRegisterResponse {
  success: boolean;
  message: string;
  storeUid?: string;
  accessToken?: string;
  setupLink?: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<EasyRegisterResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { merchantEmail, storeName, storeUrl, merchantId }: EasyRegisterRequest = req.body;

    // التحقق من البيانات المطلوبة
    if (!merchantEmail || !storeName || !storeUrl) {
      return res.status(400).json({
        success: false,
        message: "البيانات مطلوبة: البريد الإلكتروني، اسم المتجر، رابط المتجر"
      });
    }

    // التحقق من صحة البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(merchantEmail)) {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني غير صحيح"
      });
    }

    const db = dbAdmin();
    
    // التحقق من وجود المتجر مسبقاً
    const existingStoreQuery = await db
      .collection("stores")
      .where("merchantEmail", "==", merchantEmail.toLowerCase())
      .limit(1)
      .get();

    if (!existingStoreQuery.empty) {
      return res.status(409).json({
        success: false,
        message: "المتجر مسجل مسبقاً بهذا البريد الإلكتروني"
      });
    }

    // إنشاء Store UID
    const storeUid = merchantId ? `salla:${merchantId}` : `easy:${crypto.randomBytes(8).toString("hex")}`;
    
    // إنشاء Access Token للـ API
    const accessToken = crypto.randomBytes(32).toString("hex");
    
    // إنشاء رابط إعداد كلمة المرور
    const setupToken = crypto.randomBytes(24).toString("hex");
    const setupLink = `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL}/setup-password?token=${setupToken}`;

    // حفظ بيانات المتجر
    const storeData = {
      uid: storeUid,
      name: storeName.trim(),
      domain: extractDomainFromUrl(storeUrl),
      url: storeUrl.trim(),
      merchantEmail: merchantEmail.toLowerCase(),
      merchantId: merchantId || null,
      
      // إعدادات الخطة الافتراضية
      plan: {
        code: "TRIAL",
        active: true,
        startedAt: Date.now(),
        trialEndsAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 يوم
      },
      
      // إعدادات الاستخدام
      usage: {
        monthKey: getCurrentMonthKey(),
        invitesUsed: 0,
        updatedAt: Date.now(),
      },
      
      // معلومات التسجيل
      registrationMethod: "easy_mode",
      registeredAt: Date.now(),
      status: "pending_setup", // في انتظار إعداد كلمة المرور
      
      // Access Token للـ API
      accessToken: accessToken,
      
      // إعدادات الإشعارات
      notifications: {
        email: merchantEmail.toLowerCase(),
        enabled: true,
      },
      
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // حفظ بيانات إعداد كلمة المرور
    const setupData = {
      token: setupToken,
      email: merchantEmail.toLowerCase(),
      storeUid: storeUid,
      used: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // صالح لمدة 24 ساعة
    };

    // حفظ في قاعدة البيانات
    await Promise.all([
      db.collection("stores").doc(storeUid).set(storeData),
      db.collection("setup_tokens").doc(setupToken).set(setupData),
    ]);

    // إرسال بريد إلكتروني لإعداد كلمة المرور
    const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
    try {
      await sendPasswordSetupEmail({
        email: merchantEmail,
        storeUid: storeUid,
        storeName: storeName,
        redirectUrlBase: APP_BASE_URL
      });
      console.log(`[EASY_REGISTER] ✅ Setup email sent to: ${merchantEmail}`);
    } catch (emailError) {
      console.error(`[EASY_REGISTER] ⚠️ Failed to send setup email:`, emailError);
      // لا نفشل العملية بسبب فشل الإيميل
    }

    // تسجيل العملية للمراقبة
    await db.collection("registration_logs").add({
      method: "easy_mode",
      storeUid,
      merchantEmail: merchantEmail.toLowerCase(),
      storeName,
      storeUrl,
      success: true,
      timestamp: Date.now(),
    });

    console.log(`[EASY_REGISTER] 🎉 Store registered successfully: ${storeUid}`);

    return res.status(201).json({
      success: true,
      message: "تم تسجيل المتجر بنجاح! تحقق من بريدك الإلكتروني لإعداد كلمة المرور",
      storeUid,
      accessToken,
      setupLink, // للاختبار - في الإنتاج لا نرسله
    });

  } catch (error) {
    console.error("[EASY_REGISTER] ❌ Registration failed:", error);
    
    return res.status(500).json({
      success: false,
      message: "فشل في تسجيل المتجر. حاول مرة أخرى"
    });
  }
}

// استخراج الدومين من URL
function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname;
  } catch {
    // إذا فشل، أرجع النص كما هو
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

// الحصول على مفتاح الشهر الحالي للاستخدام
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

