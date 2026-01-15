// src/pages/api/stores/get-user.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { RegistrationService } from '@/server/services/registration.service';

interface UserInfo {
  storeUid: string;
  storeName: string;
  merchantEmail: string;
  plan: { code: string; active: boolean; trialEndsAt?: number };
  usage: { invitesUsed: number; monthlyLimit: number };
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
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { accessToken } = req.body;
    const registrationService = new RegistrationService();
    const result = await registrationService.getUserByAccessToken(accessToken);

    const statusCode = result.success ? 200 :
      result.message.includes('مطلوب') ? 400 : 401;

    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[GET_USER] ❌ Failed to get user info:', error);
    return res.status(500).json({
      success: false,
      message: 'فشل في جلب بيانات المستخدم'
    });
  }
}
