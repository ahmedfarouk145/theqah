// src/pages/api/auth/setup-password.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { AuthService } from "@/server/services/auth.service";

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
    const { token, password } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    const authService = new AuthService();
    const result = await authService.setupPassword(token, password, clientIp);

    const statusCode = result.success ? 200 :
      result.message.includes('رابط غير صحيح') ? 404 :
        result.message.includes('انتهت صلاحية') ? 410 :
          result.message.includes('تم استخدام') ? 409 : 400;

    return res.status(statusCode).json(result);

  } catch (error) {
    console.error("[SETUP_PASSWORD] ❌ Error:", error);

    return res.status(500).json({
      success: false,
      message: "فشل في إعداد كلمة المرور. حاول مرة أخرى"
    });
  }
}
