// src/pages/api/settings/validate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { RegistrationService } from '@/server/services/registration.service';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const registrationService = new RegistrationService();
  const result = registrationService.validateSettings(req.body);

  if (!result.valid) {
    return res.status(400).json({ message: result.message });
  }

  return res.status(200).json({ valid: true });
}
