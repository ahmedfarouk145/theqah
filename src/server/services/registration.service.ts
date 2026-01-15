/**
 * Registration Service - Store registration business logic
 * @module server/services/registration.service
 */

import crypto from 'crypto';

interface EasyRegisterInput {
    merchantEmail: string;
    storeName: string;
    storeUrl: string;
    merchantId?: string;
}

interface EasyRegisterResult {
    success: boolean;
    message: string;
    storeUid?: string;
    accessToken?: string;
    setupLink?: string;
}

interface UserInfo {
    storeUid: string;
    storeName: string;
    merchantEmail: string;
    plan: { code: string; active: boolean; trialEndsAt?: number };
    usage: { invitesUsed: number; monthlyLimit: number };
    status: string;
    registeredAt: number;
}

// Plan limits
const PLAN_LIMITS: Record<string, number> = {
    'TRIAL': 5,
    'P30': 40,
    'P60': 90,
    'P120': 200,
};

export class RegistrationService {
    /**
     * Register store via Easy Mode
     */
    async easyRegister(input: EasyRegisterInput): Promise<EasyRegisterResult> {
        const { merchantEmail, storeName, storeUrl, merchantId } = input;

        // Validate required fields
        if (!merchantEmail || !storeName || !storeUrl) {
            return {
                success: false,
                message: 'البيانات مطلوبة: البريد الإلكتروني، اسم المتجر، رابط المتجر'
            };
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(merchantEmail)) {
            return { success: false, message: 'البريد الإلكتروني غير صحيح' };
        }

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Check if store already exists
        const existingQuery = await db
            .collection('stores')
            .where('merchantEmail', '==', merchantEmail.toLowerCase())
            .limit(1)
            .get();

        if (!existingQuery.empty) {
            return { success: false, message: 'المتجر مسجل مسبقاً بهذا البريد الإلكتروني' };
        }

        // Generate IDs
        const storeUid = merchantId ? `salla:${merchantId}` : `easy:${crypto.randomBytes(8).toString('hex')}`;
        const accessToken = crypto.randomBytes(32).toString('hex');
        const setupToken = crypto.randomBytes(24).toString('hex');
        const setupLink = `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL}/setup-password?token=${setupToken}`;

        // Store data
        const storeData = {
            uid: storeUid,
            name: storeName.trim(),
            domain: this.extractDomain(storeUrl),
            url: storeUrl.trim(),
            merchantEmail: merchantEmail.toLowerCase(),
            merchantId: merchantId || null,
            plan: {
                code: 'TRIAL',
                active: true,
                startedAt: Date.now(),
                trialEndsAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            },
            usage: {
                monthKey: this.getCurrentMonthKey(),
                invitesUsed: 0,
                updatedAt: Date.now(),
            },
            registrationMethod: 'easy_mode',
            registeredAt: Date.now(),
            status: 'pending_setup',
            accessToken,
            notifications: { email: merchantEmail.toLowerCase(), enabled: true },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        const setupData = {
            token: setupToken,
            email: merchantEmail.toLowerCase(),
            storeUid,
            used: false,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000),
        };

        // Save to database
        await Promise.all([
            db.collection('stores').doc(storeUid).set(storeData),
            db.collection('setup_tokens').doc(setupToken).set(setupData),
        ]);

        // Send setup email
        try {
            const { sendPasswordSetupEmail } = await import('@/server/auth/send-password-email');
            await sendPasswordSetupEmail({
                email: merchantEmail,
                storeUid,
                storeName,
                redirectUrlBase: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || ''
            });
            console.log(`[EASY_REGISTER] ✅ Setup email sent to: ${merchantEmail}`);
        } catch (err) {
            console.error(`[EASY_REGISTER] ⚠️ Failed to send setup email:`, err);
        }

        // Log registration
        await db.collection('registration_logs').add({
            method: 'easy_mode',
            storeUid,
            merchantEmail: merchantEmail.toLowerCase(),
            storeName,
            storeUrl,
            success: true,
            timestamp: Date.now(),
        });

        console.log(`[EASY_REGISTER] 🎉 Store registered: ${storeUid}`);

        return {
            success: true,
            message: 'تم تسجيل المتجر بنجاح! تحقق من بريدك الإلكتروني لإعداد كلمة المرور',
            storeUid,
            accessToken,
            setupLink,
        };
    }

    /**
     * Get user info by access token
     */
    async getUserByAccessToken(accessToken: string): Promise<{ success: boolean; message: string; user?: UserInfo }> {
        if (!accessToken) {
            return { success: false, message: 'Access token مطلوب' };
        }

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const storeQuery = await db
            .collection('stores')
            .where('accessToken', '==', accessToken)
            .limit(1)
            .get();

        if (storeQuery.empty) {
            return { success: false, message: 'Access token غير صحيح' };
        }

        const storeDoc = storeQuery.docs[0];
        const data = storeDoc.data();

        const monthlyLimit = PLAN_LIMITS[data.plan?.code] || 5;

        const user: UserInfo = {
            storeUid: data.uid,
            storeName: data.name,
            merchantEmail: data.merchantEmail,
            plan: {
                code: data.plan?.code || 'TRIAL',
                active: data.plan?.active || false,
                trialEndsAt: data.plan?.trialEndsAt,
            },
            usage: {
                invitesUsed: data.usage?.invitesUsed || 0,
                monthlyLimit,
            },
            status: data.status || 'active',
            registeredAt: data.registeredAt || data.createdAt,
        };

        // Update last access
        await storeDoc.ref.update({ lastAccessAt: Date.now() });

        return { success: true, message: 'تم جلب بيانات المستخدم بنجاح', user };
    }

    /**
     * Validate settings input
     */
    validateSettings(input: {
        email?: string;
        store_name?: string;
        whatsapp_number?: string;
        logo_url?: string;
        enable_auto_reviews?: unknown;
    }): { valid: boolean; message?: string } {
        const { email, store_name, whatsapp_number, logo_url, enable_auto_reviews } = input;

        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return { valid: false, message: 'Invalid email address' };
        }

        if (!store_name || typeof store_name !== 'string' || store_name.length < 3) {
            return { valid: false, message: 'Store name must be at least 3 characters' };
        }

        if (!whatsapp_number || !/^\+?\d{10,15}$/.test(whatsapp_number)) {
            return { valid: false, message: 'Invalid WhatsApp number' };
        }

        if (logo_url && typeof logo_url === 'string' && !logo_url.startsWith('https://')) {
            return { valid: false, message: 'Logo URL must be a valid HTTPS link' };
        }

        if (enable_auto_reviews && typeof enable_auto_reviews !== 'boolean') {
            return { valid: false, message: 'enable_auto_reviews must be a boolean' };
        }

        return { valid: true };
    }

    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            return urlObj.hostname;
        } catch {
            return url.replace(/^https?:\/\//, '').split('/')[0];
        }
    }

    private getCurrentMonthKey(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
}
