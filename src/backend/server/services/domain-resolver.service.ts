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
            const rawVariations = [
                base,
                `${host}${base.includes('/') ? base.substring(base.indexOf('/', 8)) : ''}`,
                host,
            ];
            // Include trailing-slash variants (Zid stores store domain as "https://x.zid.store/")
            const domainVariations = [
                ...rawVariations,
                ...rawVariations.map(v => v.endsWith('/') ? v : `${v}/`),
                ...rawVariations.map(v => v.endsWith('/') ? v.slice(0, -1) : v),
            ].filter((v, i, arr) => v && arr.indexOf(v) === i);

            for (const variation of domainVariations) {
                // Try salla.domain
                const sallaSnap = await db.collection('stores')
                    .where('salla.domain', '==', variation)
                    .where('salla.connected', '==', true)
                    .where('salla.installed', '==', true)
                    .limit(1).get();

                if (!sallaSnap.empty) {
                    doc = sallaSnap.docs[0];
                    break;
                }

                // Try zid.domain — query BOTH zid_stores (Phase 3d) and
                // legacy stores. Prefer zid_stores on hit.
                const [zidNewSnap, zidLegacySnap] = await Promise.all([
                    db.collection('zid_stores')
                        .where('zid.domain', '==', variation)
                        .where('zid.connected', '==', true)
                        .limit(1).get(),
                    db.collection('stores')
                        .where('zid.domain', '==', variation)
                        .where('zid.connected', '==', true)
                        .limit(1).get(),
                ]);

                if (!zidNewSnap.empty) {
                    doc = zidNewSnap.docs[0];
                    break;
                }
                if (!zidLegacySnap.empty) {
                    doc = zidLegacySnap.docs[0];
                    break;
                }

                // Try domain.base (generic)
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
        // Support both Salla and Zid store formats
        const resolvedUid = data.storeUid || data.uid ||
            data.salla?.uid ||
            (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined) ||
            data.zid?.uid ||
            (data.zid?.storeId ? `zid:${data.zid.storeId}` : undefined);

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
            // Try multiple key formats since they may vary
            const keysToTry = [
                this.encodeUrlForFirestore(base),  // URL-encoded format
                base,  // Raw base
                host.replace(/\./g, '_').toLowerCase(),  // Underscore format (pointstylishes_com)
                `www_${host.replace(/^www\./, '').replace(/\./g, '_').toLowerCase()}`,  // www variant
                host.replace(/^www\./, '').replace(/\./g, '_').toLowerCase(),  // Non-www variant
            ].filter((k, i, arr) => k && arr.indexOf(k) === i);

            let domainDoc: FirebaseFirestore.DocumentSnapshot | null = null;

            for (const key of keysToTry) {
                try {
                    const doc = await db.collection('domains').doc(key).get();
                    if (doc.exists) {
                        domainDoc = doc;
                        break;
                    }
                } catch { /* continue */ }
            }

            if (domainDoc?.exists) {
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
        const baseVariations = [
            base,
            base.replace(/^https?:\/\//i, ''),
            base.replace(/^https?:\/\//i, '').replace(/^www\./i, ''),
            `https://${host}`,
            `http://${host}`,
            host,
            `www.${host}`,
        ];
        // Add trailing-slash variants (Zid stores may store domain with trailing slash)
        const withSlash = baseVariations.map(v => v.endsWith('/') ? v : `${v}/`);
        const withoutSlash = baseVariations.map(v => v.endsWith('/') ? v.slice(0, -1) : v);
        const variations = [...baseVariations, ...withSlash, ...withoutSlash]
            .filter((v, i, arr) => v && arr.indexOf(v) === i);

        for (const v of variations) {
            // Try Salla stores
            const sallaSnap = await db.collection('stores')
                .where('salla.domain', '==', v)
                .where('salla.connected', '==', true)
                .where('salla.installed', '==', true)
                .limit(1).get();
            if (!sallaSnap.empty) return sallaSnap.docs[0];

            // Try Zid stores — both zid_stores (Phase 3d) and legacy stores.
            const [zidNewSnap, zidLegacySnap] = await Promise.all([
                db.collection('zid_stores')
                    .where('zid.domain', '==', v)
                    .where('zid.connected', '==', true)
                    .limit(1).get(),
                db.collection('stores')
                    .where('zid.domain', '==', v)
                    .where('zid.connected', '==', true)
                    .limit(1).get(),
            ]);
            if (!zidNewSnap.empty) return zidNewSnap.docs[0];
            if (!zidLegacySnap.empty) return zidLegacySnap.docs[0];

            // Try generic domain.base
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
        // Try Salla storeId (number)
        const sallaNumSnap = await db.collection('stores')
            .where('salla.storeId', '==', Number(storeId))
            .where('salla.connected', '==', true)
            .where('salla.installed', '==', true)
            .limit(1).get();
        if (!sallaNumSnap.empty) return sallaNumSnap.docs[0];

        // Try Salla storeId (string)
        const sallaStrSnap = await db.collection('stores')
            .where('salla.storeId', '==', storeId)
            .where('salla.connected', '==', true)
            .where('salla.installed', '==', true)
            .limit(1).get();
        if (!sallaStrSnap.empty) return sallaStrSnap.docs[0];

        // Try Zid storeId — query both zid_stores (Phase 3d) and legacy stores.
        const [zidIdNewSnap, zidIdLegacySnap] = await Promise.all([
            db.collection('zid_stores')
                .where('zid.storeId', '==', storeId)
                .where('zid.connected', '==', true)
                .limit(1).get(),
            db.collection('stores')
                .where('zid.storeId', '==', storeId)
                .where('zid.connected', '==', true)
                .limit(1).get(),
        ]);
        if (!zidIdNewSnap.empty) return zidIdNewSnap.docs[0];
        if (!zidIdLegacySnap.empty) return zidIdLegacySnap.docs[0];

        // Try by uid with salla: prefix
        const sallaUidSnap = await db.collection('stores')
            .where('uid', '==', `salla:${storeId}`)
            .where('salla.connected', '==', true)
            .where('salla.installed', '==', true)
            .limit(1).get();
        if (!sallaUidSnap.empty) return sallaUidSnap.docs[0];

        // Try by uid with zid: prefix — query both collections.
        const [zidUidNewSnap, zidUidLegacySnap] = await Promise.all([
            db.collection('zid_stores')
                .where('uid', '==', `zid:${storeId}`)
                .where('zid.connected', '==', true)
                .limit(1).get(),
            db.collection('stores')
                .where('uid', '==', `zid:${storeId}`)
                .where('zid.connected', '==', true)
                .limit(1).get(),
        ]);
        if (!zidUidNewSnap.empty) return zidUidNewSnap.docs[0];
        if (!zidUidLegacySnap.empty) return zidUidLegacySnap.docs[0];

        return null;
    }
}
