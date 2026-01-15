/**
 * Activity Service - User activity tracking
 * @module server/services/activity.service
 */

import type { NextApiRequest } from 'next';

export type ActivityAction =
    | 'auth.login' | 'auth.logout' | 'auth.signup' | 'auth.password_reset'
    | 'dashboard.view' | 'reviews.view' | 'reviews.sync' | 'reviews.approve'
    | 'reviews.reject' | 'reviews.delete' | 'settings.view' | 'settings.update'
    | 'widget.install' | 'widget.customize' | 'subscription.view'
    | 'subscription.upgrade' | 'subscription.cancel' | 'api.call'
    | 'admin.access' | 'admin.user_view' | 'admin.store_view';

const VALID_ACTIONS: ActivityAction[] = [
    'auth.login', 'auth.logout', 'auth.signup', 'auth.password_reset',
    'dashboard.view', 'reviews.view', 'reviews.sync', 'reviews.approve',
    'reviews.reject', 'reviews.delete', 'settings.view', 'settings.update',
    'widget.install', 'widget.customize', 'subscription.view',
    'subscription.upgrade', 'subscription.cancel', 'api.call',
    'admin.access', 'admin.user_view', 'admin.store_view',
];

export class ActivityService {
    /**
     * Validate activity action
     */
    isValidAction(value: unknown): value is ActivityAction {
        return typeof value === 'string' && VALID_ACTIONS.includes(value as ActivityAction);
    }

    /**
     * Get session cookie from request
     */
    getSessionCookie(req: NextApiRequest): string | null {
        const cookie = req.headers.cookie || '';
        const match = cookie.match(/session=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * Get user from session and resolve storeUid
     */
    async getUserFromSession(sessionCookie: string): Promise<{ userId: string; storeUid: string }> {
        const { authAdmin, dbAdmin } = await import('@/lib/firebaseAdmin');

        const decoded = await authAdmin().verifySessionCookie(sessionCookie, true);
        const userId = decoded.uid;

        let storeUid = userId;
        try {
            const userDoc = await dbAdmin().collection('owners').doc(userId).get();
            storeUid = userDoc.data()?.uid || userId;
        } catch {
            // fallback to userId
        }

        return { userId, storeUid };
    }

    /**
     * Track activity
     */
    async track(params: {
        userId: string;
        storeUid?: string;
        action: ActivityAction;
        metadata?: Record<string, unknown>;
        req?: NextApiRequest;
    }): Promise<void> {
        const { trackActivity } = await import('@/server/activity-tracker');
        await trackActivity(params);
    }
}
