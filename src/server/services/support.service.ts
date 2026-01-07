/**
 * Support service
 * @module server/services/support.service
 */

import { getDB } from '../core';
import type { EntityBase } from '../core/types';

export interface SupportTicket extends EntityBase {
    storeUid?: string;
    email: string;
    subject: string;
    message: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority?: 'low' | 'medium' | 'high';
    assignedTo?: string;
}

export class SupportService {
    private collectionName = 'support_tickets';

    /**
     * Create a support ticket
     */
    async createTicket(
        email: string,
        subject: string,
        message: string,
        storeUid?: string
    ): Promise<string> {
        const db = getDB().db;
        const docRef = db.collection(this.collectionName).doc();

        await docRef.set({
            id: docRef.id,
            storeUid,
            email,
            subject,
            message,
            status: 'open',
            priority: 'medium',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        return docRef.id;
    }

    /**
     * Get tickets for a store
     */
    async getTicketsByStore(storeUid: string): Promise<SupportTicket[]> {
        const db = getDB().db;
        const snapshot = await db.collection(this.collectionName)
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .get();

        return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SupportTicket));
    }

    /**
     * Update ticket status
     */
    async updateStatus(ticketId: string, status: SupportTicket['status']): Promise<void> {
        const db = getDB().db;
        await db.collection(this.collectionName).doc(ticketId).update({
            status,
            updatedAt: Date.now(),
        });
    }
}
