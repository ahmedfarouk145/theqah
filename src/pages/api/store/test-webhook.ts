import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyStore } from '@/utils/verifyStore';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const error = await verifyStore(req, res);
  if (error) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { webhookUrl } = req.body;

  if (!webhookUrl) return res.status(400).json({ message: 'Missing webhookUrl' });

  try {
    const response = await axios.post(webhookUrl, {
      event: 'test',
      message: 'This is a test webhook from Thiqah system.'
    });

    return res.status(200).json({ message: 'Test webhook sent', status: response.status });
  } catch (error: unknown) {
    console.error('Webhook Test Error:', error);

    if (axios.isAxiosError(error)) {
      return res.status(500).json({ message: 'Webhook failed', error: error.message });
    }

    return res.status(500).json({ message: 'Webhook failed', error: 'Unknown error occurred' });
  }
}
