// 3. Fixed Callback Handler (api/salla/callback.ts)
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🔄 Salla callback received:', req.query);
  
  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('❌ OAuth Error:', error, error_description);
    return res.redirect(`/signup?error=${encodeURIComponent(error_description as string || 'OAuth error')}`);
  }

  if (!code || typeof code !== 'string') {
    console.error('❌ Missing authorization code');
    return res.status(400).send('Missing authorization code');
  }

  // Extract uid from state parameter
  let uid: string;
  try {
    if (state && typeof state === 'string') {
      const decodedState = JSON.parse(atob(state));
      uid = decodedState.uid;
      console.log('✅ Extracted UID from state:', uid);
    } else {
      console.error('❌ Missing state parameter');
      return res.status(400).send('Missing state parameter');
    }
  } catch (error) {
    console.error('❌ Invalid state parameter:', error);
    return res.status(400).send('Invalid state parameter');
  }

  try {
    console.log('🔄 Exchanging code for tokens...');
    
    const tokenRes = await axios.post('https://accounts.salla.sa/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.SALLA_CLIENT_ID,
        client_secret: process.env.SALLA_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/salla/callback`,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('✅ Token exchange successful:', tokenRes.data);

    const { access_token, refresh_token, store_id, expires_in } = tokenRes.data;

    // Save tokens to Firestore
    await setDoc(doc(db, 'stores', uid), {
      salla: {
        store_id: store_id?.toString(),
        access_token,
        refresh_token,
        expires_in,
        connected_at: new Date().toISOString(),
        connected: true,
      },
      sallaConnected: true,
    }, { merge: true });

    console.log('✅ Store data saved to Firestore for UID:', uid);

    res.redirect('/dashboard?connected=salla');
  } catch (err: unknown) {
  if (axios.isAxiosError(err)) {
    console.error('❌ Salla OAuth Error:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
    });

    const errorMessage = err.response?.data?.message || 'حدث خطأ أثناء الاتصال مع سلة';
    res.redirect(`/signup?error=${encodeURIComponent(errorMessage)}`);
  } else {
    console.error('❌ Unknown Error:', err);
    res.redirect(`/signup?error=${encodeURIComponent('حدث خطأ غير متوقع')}`);
  }
  }}