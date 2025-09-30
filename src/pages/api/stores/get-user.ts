// src/pages/api/stores/get-user.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

interface GetUserRequest {
  accessToken: string;
}

interface UserInfo {
  storeUid: string;
  storeName: string;
  merchantEmail: string;
  plan: {
    code: string;
    active: boolean;
    trialEndsAt?: number;
  };
  usage: {
    invitesUsed: number;
    monthlyLimit: number;
  };
  status: string;
  registeredAt: number;
}

interface GetUserResponse {
  success: boolean;
  message: string;
  user?: UserInfo;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<GetUserResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { accessToken }: GetUserRequest = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "Access token مطلوب"
      });
    }

    const db = dbAdmin();
    
    // البحث عن المتجر باستخدام Access Token
    const storeQuery = await db
      .collection("stores")
      .where("accessToken", "==", accessToken)
      .limit(1)
      .get();

    if (storeQuery.empty) {
      return res.status(401).json({
        success: false,
        message: "Access token غير صحيح"
      });
    }

    const storeDoc = storeQuery.docs[0];
    const storeData = storeDoc.data();

    // تحديد حدود الخطة
    const planLimits = {
      "TRIAL": 5,
      "P30": 40,  
      "P60": 90,
      "P120": 200,
    };

    const monthlyLimit = planLimits[storeData.plan?.code as keyof typeof planLimits] || 5;

    const userInfo: UserInfo = {
      storeUid: storeData.uid,
      storeName: storeData.name,
      merchantEmail: storeData.merchantEmail,
      plan: {
        code: storeData.plan?.code || "TRIAL",
        active: storeData.plan?.active || false,
        trialEndsAt: storeData.plan?.trialEndsAt,
      },
      usage: {
        invitesUsed: storeData.usage?.invitesUsed || 0,
        monthlyLimit,
      },
      status: storeData.status || "active",
      registeredAt: storeData.registeredAt || storeData.createdAt,
    };

    // تحديث آخر استخدام
    await storeDoc.ref.update({
      lastAccessAt: Date.now(),
    });

    return res.status(200).json({
      success: true,
      message: "تم جلب بيانات المستخدم بنجاح",
      user: userInfo,
    });

  } catch (error) {
    console.error("[GET_USER] ❌ Failed to get user info:", error);
    
    return res.status(500).json({
      success: false,
      message: "فشل في جلب بيانات المستخدم"
    });
  }
}

