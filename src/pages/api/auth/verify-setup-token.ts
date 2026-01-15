// src/pages/api/auth/verify-setup-token.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { AuthService } from "@/server/services/auth.service";

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
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        token: '',
        email: '',
        storeName: '',
        valid: false,
        message: "Token مطلوب"
      });
    }

    const authService = new AuthService();
    const result = await authService.verifySetupToken(token);

    const statusCode = result.valid ? 200 :
      result.message?.includes('رابط غير صحيح') ? 404 :
        result.message?.includes('انتهت صلاحية') ? 410 :
          result.message?.includes('تم استخدام') ? 409 : 400;

    return res.status(statusCode).json({
      token: result.token,
      email: result.email,
      storeName: result.storeName,
      valid: result.valid,
      message: result.message
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
