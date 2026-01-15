// src/pages/api/support-ticket.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SupportService } from '@/server/services/support.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const supportService = new SupportService();
    const result = await supportService.submitTicket(req.body ?? {});

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    return res.status(200).json({ message: 'Ticket submitted successfully' });
  } catch (error) {
    console.error('Error saving ticket:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}
