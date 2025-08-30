// src/utils/apiClient.ts
import Cookies from 'js-cookie';
import { isServer } from './isServer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch(url: string, options: RequestInit = {}, req?: any)
 {
  let token: string | null = null;

  if (isServer()) {
    // SSR أو API Route: قراءة التوكن من الكوكيز في الهيدر
    const cookieHeader = req?.headers?.cookie || '';
    const match = cookieHeader.match(/token=([^;]+)/);
    token = match ? match[1] : null;
  } else {
    // Client-side: قراءة من localStorage أو js-cookie
    token = localStorage.getItem('token') || Cookies.get('token') || null;
  }

  const headers = {
    ...(options.headers || {}),
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'API request failed');
  }

  return res.json();
}
