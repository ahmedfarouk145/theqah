//src/pages/connect/zid.tsx
'use client';

import { useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';

export default function ConnectZid() {
  useEffect(() => {
    (async () => {
      const auth = getAuth(app);
      const user = auth.currentUser || (await new Promise(resolve => {
        const unsub = auth.onAuthStateChanged(u => { resolve(u); unsub(); });
      }));
      if (!user) { window.location.href = '/login?next=/connect/zid'; return; }
      const idToken = await user.getIdToken();

      const r = await fetch('/api/zid/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const j = await r.json();
      if (r.ok && j.authorizeUrl) window.location.href = j.authorizeUrl;
      else window.location.href = '/dashboard?zid_start_error=1';
    })();
  }, []);

  return <main style={{padding:24}}>يتم تحويلك لربط زد…</main>;
}
