/**
 * Domain Resolver Service - Resolves store domains to storeUid
 * @module server/services/domain-resolver.service
 */

export interface ResolveResult {
    storeUid: string;
    certificatePosition?: string;
}

export interface ParsedHref {
    base: string;
    host: string;
    isTrial: boolean;
    url: URL | null;
}

export class DomainResolverService {
    private normalizeUrl(raw: unknown): URL | null {
        const s = String(raw || '').trim();
        if (!s) return null;
        const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
        try { return new URL(withProto); } catch { return null; }
    }

    parseHref(href: string): ParsedHref {
        const u = this.normalizeUrl(href);
        if (!u) return { base: '', host: '', isTrial: false, url: null };

        const origin = u.origin.toLowerCase();
        const firstSeg = u.pathname.split('/').filter(Boolean)[0] || '';
        const isTrial = firstSeg.startsWith('dev-');
        const base = isTrial ? `${origin}/${firstSeg}` : origin;

        return { base, host: u.host.toLowerCase(), isTrial, url: u };
    }

    encodeUrlForFirestore(url: string | null | undefined): string {
        if (!url) return '';
        return url
            .replace(/:/g, '_COLON_')
            .replace(/\//g, '_SLASH_')
            .replace(/\?/g, '_QUEST_')
            .replace(/#/g, '_HASH_')
            .replace(/&/g, '_AMP_');
    }

    async resolveStoreUid(params: {
        storeUid?: string;
        href?: string;
        storeId?: string;
    }): Promise<ResolveResult | null> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Direct storeUid
        if (params.storeUid) {
            return { storeUid: params.storeUid };
        }

        if (!params.href) return null;

        const { base, host, isTrial, url: hrefUrl } = this.parseHref(params.href);

        let doc: FirebaseFirestore.DocumentSnapshot | null = null;

        if (base) {
            // Try domain variations
            const domainVariations = [
                base,
                `${host}${base.includes('/') ? base.substring(base.indexOf('/', 8)) : ''}`,
                host,
            ];

            for (const variation of domainVariations) {
                // Try salla.domain
                const directSnap = await db.collection('stores')
                    .where('salla.domain', '==', variation)
                    .where('salla.connected', '==', true)
                    .where('salla.installed', '==', true)
                    .limit(1).get();

                if (!directSnap.empty) {
                    doc = directSnap.docs[0];
                    break;
                }

                // Try domain.base
                const snapNew = await db.collection('stores')
                    .where('domain.base', '==', variation)
                    .limit(1).get();

                if (!snapNew.empty) {
                    doc = snapNew.docs[0];
                    break;
                }
            }

            // Try domains collection
            if (!doc) {
                doc = await this.lookupFromDomainsCollection(db, base, hrefUrl, host);
            }

            // Try variations for non-trial stores
            if (!doc && !isTrial) {
                doc = await this.tryDomainVariations(db, base, host);
            }
        } else if (params.storeId) {
            doc = await this.lookupByStoreId(db, params.storeId);
        }

        // Final fallback: identifier from href query params
        if (!doc && hrefUrl) {
            const identifier = hrefUrl.searchParams.get('identifier') ||
                hrefUrl.searchParams.get('merchant') ||
                hrefUrl.searchParams.get('store_id');
            if (identifier) {
                doc = await this.lookupByStoreId(db, identifier);
            }
        }

        if (!doc) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = doc.data() as any;
        const resolvedUid = data.storeUid || data.uid || data.salla?.uid ||
            (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined);

        if (!resolvedUid) return null;

        return {
            storeUid: resolvedUid,
            certificatePosition: data.settings?.certificatePosition || 'auto',
        };
    }

    private async lookupFromDomainsCollection(
        db: FirebaseFirestore.Firestore,
        base: string,
        hrefUrl: URL | null,
        host: string
    ): Promise<FirebaseFirestore.DocumentSnapshot | null> {
        try {
            const encodedBase = this.encodeUrlForFirestore(base);
            let domainDoc = await db.collection('domains').doc(encodedBase).get();

            if (!domainDoc.exists) {
                try { domainDoc = await db.collection('domains').doc(base).get(); } catch { /* */ }
            }

            if (domainDoc.exists) {
                const d = domainDoc.data() as { storeUid?: string; uid?: string } | undefined;
                const fromUid = d?.storeUid || d?.uid;
                if (fromUid) {
                    const storeDoc = await db.collection('stores').doc(fromUid).get();
                    if (storeDoc.exists) return storeDoc;
                }
            }

            // Try host/dev-xxx variant
            if (hrefUrl) {
                const firstSeg = hrefUrl.pathname.split('/').filter(Boolean)[0] || '';
                if (firstSeg.startsWith('dev-')) {
                    const hostDev = `${host}/${firstSeg}`;
                    const encHostDev = this.encodeUrlForFirestore(hostDev);
                    let hostDoc = await db.collection('domains').doc(encHostDev).get();
                    if (!hostDoc.exists) {
                        try { hostDoc = await db.collection('domains').doc(hostDev).get(); } catch { /* */ }
                    }
                    if (hostDoc.exists) {
                        const hd = hostDoc.data() as { storeUid?: string; uid?: string } | undefined;
                        const fromUid = hd?.storeUid || hd?.uid;
                        if (fromUid) {
                            const storeDoc = await db.collection('stores').doc(fromUid).get();
                            if (storeDoc.exists) return storeDoc;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[DomainResolver] domain lookup failed:', e);
        }
        return null;
    }

    private async tryDomainVariations(
        db: FirebaseFirestore.Firestore,
        base: string,
        host: string
    ): Promise<FirebaseFirestore.DocumentSnapshot | null> {
        const variations = [
            base,
            base.replace(/^https?:\/\//i, ''),
            base.replace(/^https?:\/\//i, '').replace(/^www\./i, ''),
            `https://${host}`,
            `http://${host}`,
            host,
            `www.${host}`,
        ].filter((v, i, arr) => v && arr.indexOf(v) === i);

        for (const v of variations) {
            const snapVar = await db.collection('stores')
                .where('salla.domain', '==', v)
                .where('salla.connected', '==', true)
                .where('salla.installed', '==', true)
                .limit(1).get();
            if (!snapVar.empty) return snapVar.docs[0];

            const snapVarNew = await db.collection('stores')
                .where('domain.base', '==', v).limit(1).get();
            if (!snapVarNew.empty) return snapVarNew.docs[0];
        }
        return null;
    }

    private async lookupByStoreId(
        db: FirebaseFirestore.Firestore,
        storeId: string
    ): Promise<FirebaseFirestore.DocumentSnapshot | null> {
        const snapNum = await db.collection('stores')
            .where('salla.storeId', '==', Number(storeId))
            .where('salla.connected', '==', true)
            .where('salla.installed', '==', true)
            .limit(1).get();
        if (!snapNum.empty) return snapNum.docs[0];

        const snapStr = await db.collection('stores')
            .where('salla.storeId', '==', storeId)
            .where('salla.connected', '==', true)
            .where('salla.installed', '==', true)
            .limit(1).get();
        if (!snapStr.empty) return snapStr.docs[0];

        const snapUid = await db.collection('stores')
            .where('uid', '==', `salla:${storeId}`)
            .where('salla.connected', '==', true)
            .where('salla.installed', '==', true)
            .limit(1).get();
        if (!snapUid.empty) return snapUid.docs[0];

        return null;
    }
}
