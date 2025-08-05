
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing code');
  }

  // Get uid from state parameter
  let uid: string;
  try {
    if (state && typeof state === 'string') {
      const decodedState = JSON.parse(atob(state));
      uid = decodedState.uid;
    } else {
      return res.status(400).send('Missing state parameter');
    }
  } catch (error) {
    return res.status(400).send('Invalid state parameter');
  }

  try {
    const tokenRes = await axios.post('https://accounts.salla.sa/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.SALLA_CLIENT_ID,
        client_secret: process.env.SALLA_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/salla/callback`, // No uid here
      },
    });

    const { access_token, refresh_token, store_id, expires_in } = tokenRes.data;

    await setDoc(doc(db, 'stores', uid), {
      salla: {
        store_id,
        access_token,
        refresh_token,
        expires_in,
        connected_at: new Date().toISOString(),
        connected: true,
      },
    }, { merge: true });

    res.redirect('/dashboard?connected=salla');
  } catch (err) {
    console.error('[SALLA OAuth ERROR]', err);
    res.status(500).send('حدث خطأ أثناء الاتصال مع سلة');
  }
}