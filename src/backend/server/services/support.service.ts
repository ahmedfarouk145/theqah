/**
 * Support Service - Feedback, tickets, and reports
 * @module server/services/support.service
 */

interface FeedbackInput {
    type: string;
    message: string;
    userEmail?: string;
    userName?: string;
    userAgent?: string;
    url?: string;
}

interface SupportTicketInput {
    name: string;
    email: string;
    message: string;
}

interface ReviewReportInput {
    reviewId: string;
    reason: string;
    name?: string;
    email?: string;
}

export class SupportService {
    /**
     * Submit feedback
     */
    async submitFeedback(input: FeedbackInput): Promise<{ success: boolean; feedbackId?: string; error?: string }> {
        const { type, message, userEmail, userName, userAgent, url } = input;

        // Validation
        if (!type || !message) {
            return { success: false, error: 'Type and message are required' };
        }

        if (message.length < 10 || message.length > 500) {
            return { success: false, error: 'Message must be between 10-500 characters' };
        }

        const validTypes = ['bug', 'feature', 'question', 'other'];
        if (!validTypes.includes(type)) {
            return { success: false, error: 'Invalid feedback type' };
        }

        const { getDb } = await import('@/server/firebase-admin');
        const db = getDb();
        const timestamp = new Date();

        // Save to Firestore
        const feedbackRef = await db.collection('feedback').add({
            type,
            message,
            userEmail: userEmail || null,
            userName: userName || null,
            userAgent: userAgent || null,
            url: url || null,
            status: 'new',
            createdAt: timestamp,
            resolvedAt: null,
            notes: null,
        });

        // Send email notification
        try {
            await this.sendFeedbackEmail({
                id: feedbackRef.id,
                type,
                message,
                userEmail,
                userName,
                url,
                timestamp,
            });
        } catch (err) {
            console.error('Failed to send feedback email:', err);
        }

        // Track in metrics
        await db.collection('metrics').add({
            timestamp,
            type: 'feedback',
            severity: 'info',
            metadata: {
                feedbackType: type,
                feedbackId: feedbackRef.id,
                hasUserInfo: !!userEmail,
            },
        });

        return { success: true, feedbackId: feedbackRef.id };
    }

    /**
     * Submit support ticket
     */
    async submitTicket(input: SupportTicketInput): Promise<{ success: boolean; error?: string }> {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        const email = typeof input.email === 'string' ? input.email.trim() : '';
        const message = typeof input.message === 'string' ? input.message.trim() : '';

        if (!name || !email || !message) {
            return { success: false, error: 'Missing fields' };
        }

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('support_tickets').add({
            name,
            email,
            message,
            createdAt: Date.now(),
        });

        return { success: true };
    }

    /**
     * Report a review
     */
    async reportReview(input: ReviewReportInput): Promise<{ success: boolean; error?: string }> {
        const { reviewId, reason, name, email } = input;

        if (!reviewId || !reason) {
            return { success: false, error: 'reviewId and reason are required' };
        }

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('review_reports').add({
            reviewId: String(reviewId),
            reason: String(reason).slice(0, 2000),
            name: name ? String(name).slice(0, 200) : undefined,
            email: email ? String(email).slice(0, 200) : undefined,
            createdAt: Date.now(),
            resolved: false,
        });

        return { success: true };
    }

    /**
     * Get Salla verification info (debug)
     */
    async getSallaVerification(uid: string): Promise<{
        ok: boolean;
        uid: string;
        tokens: {
            access_token: string | null;
            refresh_token: string | null;
            expiresAt: number | null;
            obtainedAt: number | null;
            scope: string;
        };
        store: {
            platform: string | null;
            connected: boolean;
            installed: boolean;
            connectedAt: number | null;
            updatedAt: number | null;
            salla: { oauth: unknown };
        };
    }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const tok = await db.collection('salla_tokens').doc(uid).get();
        const store = await db.collection('stores').doc(uid).get();

        const t = tok.exists ? tok.data() || {} : {};
        const s = store.exists ? store.data() || {} : {};

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tAny = t as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sAny = s as any;

        const tokenScope = tAny.scope || '';
        const oauthScope = sAny?.salla?.oauth?.scope || '';

        return {
            ok: true,
            uid,
            tokens: {
                access_token: this.redact(tAny.accessToken),
                refresh_token: this.redact(tAny.refreshToken),
                expiresAt: tAny.expiresAt || null,
                obtainedAt: tAny.obtainedAt || null,
                scope: tokenScope || oauthScope,
            },
            store: {
                platform: sAny.platform || null,
                connected: !!sAny?.salla?.connected,
                installed: !!sAny?.salla?.installed,
                connectedAt: sAny.connectedAt || null,
                updatedAt: sAny.updatedAt || null,
                salla: { oauth: sAny?.salla?.oauth || null },
            },
        };
    }

    private redact(s?: string | null): string | null {
        if (!s) return null;
        return s.length <= 12 ? `${s.length}ch:${s}` : `${s.length}ch:${s.slice(0, 6)}…${s.slice(-6)}`;
    }

    private async sendFeedbackEmail(data: {
        id: string;
        type: string;
        message: string;
        userEmail?: string;
        userName?: string;
        url?: string;
        timestamp: Date;
    }) {
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'farwqahmd118@gmail.com';

        const typeEmoji: Record<string, string> = { bug: '🐛', feature: '💡', question: '❓', other: '💬' };
        const typeLabel: Record<string, string> = { bug: 'Bug Report', feature: 'Feature Request', question: 'Question', other: 'Other' };

        const emailHtml = this.buildFeedbackEmailHtml(data, typeEmoji, typeLabel);
        const subject = `${typeEmoji[data.type]} [TheQah] ${typeLabel[data.type]}: ${data.message.substring(0, 50)}...`;

        // Use Dmail instead of SendGrid
        try {
            const { sendEmailDmail } = await import('@/server/messaging/email-dmail');
            const result = await sendEmailDmail(ADMIN_EMAIL, subject, emailHtml);

            if (!result.ok) {
                console.error('Dmail failed to send feedback email:', result.error);
            }
        } catch (err) {
            console.error('Failed to send feedback email via Dmail:', err);
        }
    }

    private buildFeedbackEmailHtml(
        data: { id: string; type: string; message: string; userEmail?: string; userName?: string; url?: string; timestamp: Date },
        typeEmoji: Record<string, string>,
        typeLabel: Record<string, string>
    ): string {
        return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"></head><body>
            <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
                <h2>${typeEmoji[data.type]} ${typeLabel[data.type]}</h2>
                <p><strong>Message:</strong> ${data.message}</p>
                ${data.userName ? `<p><strong>User:</strong> ${data.userName}</p>` : ''}
                ${data.userEmail ? `<p><strong>Email:</strong> ${data.userEmail}</p>` : ''}
                ${data.url ? `<p><strong>URL:</strong> ${data.url}</p>` : ''}
                <p><strong>Date:</strong> ${data.timestamp.toISOString()}</p>
                <p><strong>ID:</strong> ${data.id}</p>
            </div>
        </body></html>`;
    }
}
