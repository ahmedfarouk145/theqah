/**
 * Auth Service - Authentication business logic
 * @module server/services/auth.service
 */

import bcrypt from 'bcryptjs';

export interface SessionUser {
    uid: string;
    email: string | null;
}

export interface SetupTokenData {
    token: string;
    email: string;
    storeName: string;
    storeUid: string;
    valid: boolean;
    message?: string;
}

export interface SetupPasswordResult {
    success: boolean;
    message: string;
    storeUid?: string;
}

export class AuthService {
    /**
     * Create session cookie from ID token
     */
    async createSession(idToken: string, expiresInMs: number = 5 * 24 * 60 * 60 * 1000): Promise<{
        sessionCookie: string;
        uid: string;
    }> {
        const { authAdmin } = await import('@/lib/firebaseAdmin');
        const auth = authAdmin();

        // Verify token first
        const decoded = await auth.verifyIdToken(idToken);

        // Create session cookie
        const sessionCookie = await auth.createSessionCookie(idToken, {
            expiresIn: expiresInMs,
        });

        return { sessionCookie, uid: decoded.uid };
    }

    /**
     * Verify session cookie
     */
    async verifySession(sessionCookie: string): Promise<SessionUser> {
        const { authAdmin } = await import('@/lib/firebaseAdmin');
        const decoded = await authAdmin().verifySessionCookie(sessionCookie, true);

        return {
            uid: decoded.uid,
            email: decoded.email ?? null,
        };
    }

    /**
     * Revoke user's refresh tokens (logout)
     */
    async revokeSession(sessionCookie: string): Promise<void> {
        const { authAdmin } = await import('@/lib/firebaseAdmin');
        const auth = authAdmin();

        try {
            const decoded = await auth.verifySessionCookie(sessionCookie, false);
            await auth.revokeRefreshTokens(decoded.sub);
        } catch {
            // Ignore verification errors, we'll clear the cookie anyway
        }
    }

    /**
     * Verify setup token for password setup
     */
    async verifySetupToken(token: string): Promise<SetupTokenData> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const tokenDoc = await db.collection('setup_tokens').doc(token).get();

        if (!tokenDoc.exists) {
            return {
                token,
                email: '',
                storeName: '',
                storeUid: '',
                valid: false,
                message: 'رابط غير صحيح',
            };
        }

        const tokenData = tokenDoc.data()!;

        // Check expiration
        if (Date.now() > tokenData.expiresAt) {
            return {
                token,
                email: tokenData.email || '',
                storeName: '',
                storeUid: tokenData.storeUid || '',
                valid: false,
                message: 'انتهت صلاحية الرابط',
            };
        }

        // Check if already used
        if (tokenData.used) {
            return {
                token,
                email: tokenData.email || '',
                storeName: '',
                storeUid: tokenData.storeUid || '',
                valid: false,
                message: 'تم استخدام هذا الرابط من قبل',
            };
        }

        // Get store name
        const storeDoc = await db.collection('stores').doc(tokenData.storeUid).get();
        const storeName = storeDoc.exists ? storeDoc.data()?.name || 'متجرك' : 'متجرك';

        return {
            token,
            email: tokenData.email,
            storeName,
            storeUid: tokenData.storeUid,
            valid: true,
            message: 'رابط صحيح',
        };
    }

    /**
     * Set password for a store using setup token
     */
    async setupPassword(
        token: string,
        password: string,
        clientIp?: string
    ): Promise<SetupPasswordResult> {
        if (!token || !password) {
            return { success: false, message: 'التوكن وكلمة المرور مطلوبان' };
        }

        if (password.length < 8) {
            return { success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
        }

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Verify token
        const tokenDoc = await db.collection('setup_tokens').doc(token).get();

        if (!tokenDoc.exists) {
            return { success: false, message: 'رابط غير صحيح' };
        }

        const tokenData = tokenDoc.data()!;

        if (Date.now() > tokenData.expiresAt) {
            return { success: false, message: 'انتهت صلاحية الرابط' };
        }

        if (tokenData.used) {
            return { success: false, message: 'تم استخدام هذا الرابط من قبل' };
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Update store and mark token as used in transaction
        const storeRef = db.collection('stores').doc(tokenData.storeUid);

        await db.runTransaction(async (transaction) => {
            const storeDoc = await transaction.get(storeRef);

            if (!storeDoc.exists) {
                throw new Error('المتجر غير موجود');
            }

            transaction.update(storeRef, {
                password: hashedPassword,
                status: 'active',
                passwordSetAt: Date.now(),
                updatedAt: Date.now(),
            });

            transaction.update(db.collection('setup_tokens').doc(token), {
                used: true,
                usedAt: Date.now(),
            });
        });

        // Log the operation
        await db.collection('auth_logs').add({
            type: 'password_setup',
            storeUid: tokenData.storeUid,
            email: tokenData.email,
            success: true,
            timestamp: Date.now(),
            ip: clientIp || null,
        });

        console.log(`[SETUP_PASSWORD] ✅ Password set for store: ${tokenData.storeUid}`);

        return {
            success: true,
            message: 'تم إعداد كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول',
            storeUid: tokenData.storeUid,
        };
    }
}
