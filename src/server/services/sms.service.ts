/**
 * SMS Service - SMS delivery and status handling
 * @module server/services/sms.service
 */

type DeliveryStatus = 'delivered' | 'failed' | 'pending' | 'unknown';

interface DlrItem {
    inviteId?: string;
    status?: string;
}

interface StatusItem {
    phone: string;
    messageId: string;
    jobId: string;
    status: DeliveryStatus;
    msgDate: number;
    statusDate: number;
}

export class SmsService {
    /**
     * Normalize delivery status
     */
    normalizeStatus(rawStatus?: string): DeliveryStatus {
        const s = (rawStatus || '').toLowerCase();
        if (['delivered', 'delivrd', 'success', 'delivered_ok', 'ok'].includes(s)) return 'delivered';
        if (['failed', 'undelivered', 'rejected', 'expired', 'blocked', 'error'].includes(s)) return 'failed';
        if (['sent', 'accepted', 'queued', 'submitted', 'pending', 'process', 'processing'].includes(s)) return 'pending';
        return 'unknown';
    }

    /**
     * Normalize phone number
     */
    normalizePhone(phone?: string): string {
        return (phone || '').replace(/[^\d]/g, '');
    }

    /**
     * Parse ISO date or return now
     */
    parseIsoDate(ts?: string): number {
        const t = Date.parse(String(ts || ''));
        return Number.isFinite(t) ? t : Date.now();
    }

    /**
     * Extract DLR items from webhook body
     */
    extractDlrItems(body: unknown): DlrItem[] {
        if (Array.isArray(body)) {
            return body.map(this.parseDlrItem).filter((x): x is DlrItem => !!x);
        }
        if (this.isRecord(body)) {
            const maybeItems = (body as Record<string, unknown>).items ?? (body as Record<string, unknown>).dlrs;
            if (Array.isArray(maybeItems)) {
                return maybeItems.map(this.parseDlrItem).filter((x): x is DlrItem => !!x);
            }
            const single = this.parseDlrItem(body);
            return single ? [single] : [];
        }
        return [];
    }

    /**
     * Process delivery receipts
     */
    async processDlr(items: DlrItem[]): Promise<number> {
        if (!items.length) return 0;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        const ops: Promise<void>[] = [];

        for (const it of items) {
            const inviteId = it.inviteId;
            if (!inviteId || typeof inviteId !== 'string') continue;

            const status = this.normalizeStatus(it.status);
            const delivered = status === 'delivered';

            ops.push(
                db.collection('review_invites').doc(inviteId).set({
                    deliveryStatus: status || null,
                    deliveredAt: delivered ? Date.now() : null,
                }, { merge: true }).then(() => void 0)
            );
        }

        await Promise.allSettled(ops);
        return ops.length;
    }

    /**
     * Handle inbound SMS (opt-out)
     */
    async handleInbound(from: string, body: string): Promise<void> {
        if ((body || '').toString().trim().toUpperCase() === 'STOP') {
            const phone = this.normalizePhone(from);
            const { dbAdmin } = await import('@/lib/firebaseAdmin');
            await dbAdmin().collection('optouts_sms').doc(phone).set({ createdAt: Date.now() }, { merge: true });
        }
    }

    /**
     * Process SMS status updates
     */
    async processStatusUpdates(items: StatusItem[]): Promise<number> {
        if (!items.length) return 0;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        let processed = 0;

        await Promise.all(
            items.map(async (it) => {
                const logDocId = it.messageId || `${it.phone}:${it.statusDate}`;

                await db.collection('sms_logs').doc(logDocId).set({
                    provider: 'oursms',
                    phone: it.phone,
                    messageId: it.messageId || null,
                    jobId: it.jobId || null,
                    status: it.status,
                    msgDate: it.msgDate,
                    statusDate: it.statusDate,
                    at: Date.now(),
                }, { merge: true });

                // Update related invite
                try {
                    const since = Date.now() - 48 * 60 * 60 * 1000;
                    const invSnap = await db
                        .collection('review_invites')
                        .where('customerPhone', '==', it.phone)
                        .where('createdAt', '>=', since)
                        .limit(1)
                        .get();

                    if (!invSnap.empty) {
                        await invSnap.docs[0].ref.set(
                            { lastDeliveryStatus: it.status, deliveryAt: it.statusDate },
                            { merge: true }
                        );
                    }
                } catch {
                    // ignore invite update errors
                }

                processed++;
            })
        );

        return processed;
    }

    /**
     * Parse status items from webhook body
     */
    parseStatusItems(body: unknown): StatusItem[] {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: Array<Record<string, unknown>> = Array.isArray((body as any)?.statuses)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (body as any).statuses
            : [];

        if (!Array.isArray(list) || list.length === 0) {
            const single = (body && typeof body === 'object') ? (body as Record<string, unknown>) : null;
            if (single && (single.status || single.msgId || single.dest)) {
                list.push(single);
            }
        }

        return list.map((it) => ({
            phone: this.normalizePhone(this.asString(it.dest || it.msisdn || it.to || it.phone)),
            messageId: this.asString(it.msgId || it.message_id || it.id || it.msgid),
            jobId: this.asString(it.jobId || it.batchId || ''),
            status: this.normalizeStatus(this.asString(it.status || it.dlr || it.state)),
            msgDate: this.parseIsoDate(this.asString(it.msgDate)),
            statusDate: this.parseIsoDate(this.asString(it.statusDate)),
        }));
    }

    private isRecord(v: unknown): v is Record<string, unknown> {
        return typeof v === 'object' && v !== null;
    }

    private parseDlrItem(v: unknown): DlrItem | null {
        if (!this.isRecord(v)) return null;
        const rec = v as Record<string, unknown>;
        const inviteId =
            (typeof rec.inviteId === 'string' && rec.inviteId) ||
            (this.isRecord(rec.meta) && typeof (rec.meta as Record<string, unknown>).inviteId === 'string' && (rec.meta as Record<string, unknown>).inviteId as string) ||
            undefined;

        const status =
            (typeof rec.status === 'string' && rec.status) ||
            (typeof rec.Status === 'string' && rec.Status) ||
            undefined;

        return { inviteId, status };
    }

    private asString(v: unknown): string {
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return String(v[0] ?? '');
        if (v == null) return '';
        return String(v);
    }
}
