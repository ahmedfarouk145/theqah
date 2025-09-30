// src/pages/api/auth/verify-setup-token.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

interface VerifyTokenRequest {
  token: string;
}

interface VerifyTokenResponse {
  token: string;
  email: string;
  storeName: string;
  valid: boolean;
  message?: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<VerifyTokenResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      token: '',
      email: '',
      storeName: '',
      valid: false,
      message: "Method not allowed"
    });
  }

  try {
    const { token }: VerifyTokenRequest = req.body;

    if (!token) {
      return res.status(400).json({
        token: '',
        email: '',
        storeName: '',
        valid: false,
        message: "Token مطلوب"
      });
    }

    const db = dbAdmin();
    
    // البحث عن Setup Token
    const tokenDoc = await db.collection("setup_tokens").doc(token).get();

    if (!tokenDoc.exists) {
      return res.status(404).json({
        token,
        email: '',
        storeName: '',
        valid: false,
        message: "رابط غير صحيح"
      });
    }

    const tokenData = tokenDoc.data()!;

    // التحقق من انتهاء الصلاحية
    if (Date.now() > tokenData.expiresAt) {
      return res.status(410).json({
        token,
        email: tokenData.email || '',
        storeName: '',
        valid: false,
        message: "انتهت صلاحية الرابط"
      });
    }

    // التحقق من الاستخدام
    if (tokenData.used) {
      return res.status(409).json({
        token,
        email: tokenData.email || '',
        storeName: '',
        valid: false,
        message: "تم استخدام هذا الرابط من قبل"
      });
    }

    // جلب بيانات المتجر
    const storeDoc = await db.collection("stores").doc(tokenData.storeUid).get();
    const storeName = storeDoc.exists ? storeDoc.data()?.name || 'متجرك' : 'متجرك';

    return res.status(200).json({
      token,
      email: tokenData.email,
      storeName,
      valid: true,
      message: "رابط صحيح"
    });

  } catch (error) {
    console.error("[VERIFY_SETUP_TOKEN] ❌ Error:", error);
    
    return res.status(500).json({
      token: req.body?.token || '',
      email: '',
      storeName: '',
      valid: false,
      message: "خطأ في الخادم"
    });
  }
}

