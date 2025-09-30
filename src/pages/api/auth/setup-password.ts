// src/pages/api/auth/setup-password.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import bcrypt from 'bcryptjs';

interface SetupPasswordRequest {
  token: string;
  password: string;
}

interface SetupPasswordResponse {
  success: boolean;
  message: string;
  storeUid?: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<SetupPasswordResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { token, password }: SetupPasswordRequest = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "التوكن وكلمة المرور مطلوبان"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
      });
    }

    const db = dbAdmin();
    
    // التحقق من Setup Token
    const tokenDoc = await db.collection("setup_tokens").doc(token).get();

    if (!tokenDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "رابط غير صحيح"
      });
    }

    const tokenData = tokenDoc.data()!;

    // التحقق من انتهاء الصلاحية
    if (Date.now() > tokenData.expiresAt) {
      return res.status(410).json({
        success: false,
        message: "انتهت صلاحية الرابط"
      });
    }

    // التحقق من الاستخدام
    if (tokenData.used) {
      return res.status(409).json({
        success: false,
        message: "تم استخدام هذا الرابط من قبل"
      });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 12);

    // تحديث بيانات المتجر
    const storeRef = db.collection("stores").doc(tokenData.storeUid);
    
    await db.runTransaction(async (transaction) => {
      const storeDoc = await transaction.get(storeRef);
      
      if (!storeDoc.exists) {
        throw new Error("المتجر غير موجود");
      }

      // تحديث بيانات المتجر
      transaction.update(storeRef, {
        password: hashedPassword,
        status: "active", // تفعيل المتجر
        passwordSetAt: Date.now(),
        updatedAt: Date.now(),
      });

      // وضع علامة على أن التوكن مستخدم
      transaction.update(db.collection("setup_tokens").doc(token), {
        used: true,
        usedAt: Date.now(),
      });
    });

    // تسجيل العملية
    await db.collection("auth_logs").add({
      type: "password_setup",
      storeUid: tokenData.storeUid,
      email: tokenData.email,
      success: true,
      timestamp: Date.now(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });

    console.log(`[SETUP_PASSWORD] ✅ Password set for store: ${tokenData.storeUid}`);

    return res.status(200).json({
      success: true,
      message: "تم إعداد كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول",
      storeUid: tokenData.storeUid,
    });

  } catch (error) {
    console.error("[SETUP_PASSWORD] ❌ Error:", error);
    
    return res.status(500).json({
      success: false,
      message: "فشل في إعداد كلمة المرور. حاول مرة أخرى"
    });
  }
}

