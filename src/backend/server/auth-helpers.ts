/**
 * Authentication Helper Functions
 * 
 * Provides admin session verification for protected endpoints
 */

import { NextApiRequest } from 'next';
import { authAdmin } from '@/lib/firebaseAdmin';

export interface AdminSession {
  user: {
    email: string;
    name?: string;
    role: 'admin' | 'user';
    uid?: string;
  };
}

/**
 * Verify admin session from request
 * @throws Error if not authenticated or not admin
 */
export async function verifyAdminSession(req: NextApiRequest): Promise<AdminSession> {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);
  const sessionCookie = match ? decodeURIComponent(match[1]) : null;

  if (!sessionCookie) {
    throw new Error('Unauthorized - No session found');
  }

  const decoded = await authAdmin().verifySessionCookie(sessionCookie, true);

  const userEmail = decoded.email;
  const adminEmails = (process.env.ADMIN_EMAILS?.split(',') || []).map(e => e.trim()).filter(Boolean);
  
  if (!adminEmails.includes(userEmail || '')) {
    throw new Error('Forbidden - Admin access required');
  }
  
  return {
    user: {
      email: userEmail || '',
      name: decoded.name || undefined,
      uid: decoded.uid,
      role: 'admin'
    }
  };
}

/**
 * Check if session belongs to admin (non-throwing)
 */
export async function isAdminSession(req: NextApiRequest): Promise<boolean> {
  try {
    await verifyAdminSession(req);
    return true;
  } catch {
    return false;
  }
}
