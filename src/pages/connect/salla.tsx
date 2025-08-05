// src/pages/connect/salla.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ConnectSalla() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NEXT_PUBLIC_SALLA_CLIENT_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/salla/callback`,
      scope: 'offline_access orders.read reviews.read',
    });

    window.location.href = `https://accounts.salla.sa/oauth/authorize?${params.toString()}`;
  }, []);

  return <p className="text-center p-8">جاري تحويلك إلى سلة...</p>;
}