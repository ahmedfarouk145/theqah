// src/pages/api/admin/users.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/server/auth/requireAdmin';
import { AdminService } from '@/server/services/admin.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        await requireAdmin(req);
        const adminService = new AdminService();

        if (req.method === 'GET') {
            const { q = '', limit = '50', cursor } = req.query;
            const result = await adminService.listUsers(
                typeof q === 'string' ? q : '',
                Number(limit) || 50,
                typeof cursor === 'string' ? cursor : undefined
            );
            return res.status(200).json(result);
        }

        if (req.method === 'POST') {
            const { uid, makeAdmin } = req.body || {};
            if (!uid || typeof makeAdmin !== 'boolean') {
                return res.status(400).json({ message: 'uid/makeAdmin required' });
            }
            await adminService.setUserAdminClaim(uid, makeAdmin);
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ message: 'Method not allowed' });
    } catch (e) {
        console.error('Admin users API error:', e);
        return res.status(403).json({ message: 'forbidden' });
    }
}
