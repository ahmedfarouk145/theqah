// src/pages/api/stores/easy-register.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { RegistrationService } from '@/server/services/registration.service';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const registrationService = new RegistrationService();
    const result = await registrationService.easyRegister(req.body);

    const statusCode = result.success ? 201 :
      result.message.includes('مسجل مسبقاً') ? 409 : 400;

    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[EASY_REGISTER] ❌ Registration failed:', error);
    return res.status(500).json({
      success: false,
      message: 'فشل في تسجيل المتجر. حاول مرة أخرى'
    });
  }
}
