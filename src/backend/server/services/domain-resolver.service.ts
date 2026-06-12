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
    /** true when the store lives under a path on a shared platform host
     *  (e.g. salla.sa/<store>) — bare-host lookups must be skipped or
     *  every path store on the host resolves to the same store. */
    isPlatformPath: boolean;
    url: URL | null;
}

/** Shared platform hosts where the first path segment IS the store. */
const PLATFORM_PATH_HOSTS = new Set([
    'salla.sa', 'www.salla.sa',
    'zid.sa', 'www.zid.sa',
]);

/** Negative-cache (tombstone) TTL for unresolvable domains. */
const TOMBSTONE_TTL_MS = 6 * 60 * 60 * 1000;

export class DomainResolverService {
    private normalizeUrl(raw: unknown): URL | null {
        const s = String(raw || '').trim();
        if (!s) return null;
        const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
        try { return new URL(withProto); } catch { return null; }
    }

    parseHref(href: string): ParsedHref {
        const u = this.normalizeUrl(href);
        if (!u) return { base: '', host: '', isTrial: false, isPlatformPath: false, url: null };

        const origin = u.origin.toLowerCase();
        const host = u.host.toLowerCase();
        const firstSeg = u.pathname.split('/').filter(Boolean)[0] || '';
        const isTrial = firstSeg.startsWith('dev-');
        const isPlatformPath = !isTrial && PLATFORM_PATH_HOSTS.has(host) && !!firstSeg;
        const base = (isTrial || isPlatformPath) ? `${origin}/${firstSeg}` : origin;

        return { base, host, isTrial, isPlatformPath, url: u };
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

        const parsed = this.parseHref(params.href);
        const { base, host, isTrial, isPlatformPath, url: hrefUrl } = parsed;

        let doc: FirebaseFirestore.DocumentSnapshot | null = null;
        let viaFastPath = false;

        // FAST PATH: a previous resolution (or install-time mapping) put
        // this domain in the `domains` collection — 1-3 doc reads instead
        // of the ~60-query brute force below. Also honors tombstones so
        // repeatedly-unresolvable domains cost 1 read until the TTL ends.
        if (base) {
            const fast = await this.fastLookup(db, parsed);
            if (fast === 'tombstone') return null;
            if (fast) {
                doc = fast;
                viaFastPath = true;
            }
        }

        if (!doc && base) {
            // Try domain variations.
            // Platform-path stores (salla.sa/<store>) must never match on
            // the bare host — that's shared by every store on the platform.
            const rawVariations = isPlatformPath
                ? [base, `${host}${base.substring(base.indexOf('/', 8))}`]
                : [
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
                doc = await this.lookupFromDomainsCollection(db, base, hrefUrl, host, isPlatformPath);
            }

            // Try variations for non-trial, non-platform-path stores
            if (!doc && !isTrial && !isPlatformPath) {
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

        if (!doc) {
            // Negative cache: the next miss for this base costs 1 read
            // instead of the full brute force, until the TTL expires.
            if (base) await this.writeTombstone(db, base);
            return null;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = doc.data() as any;
        // Support both Salla and Zid store formats
        const resolvedUid = data.storeUid || data.uid ||
            data.salla?.uid ||
            (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined) ||
            data.zid?.uid ||
            (data.zid?.storeId ? `zid:${data.zid.storeId}` : undefined);

        if (!resolvedUid) return null;

        // Write-through: brute-force successes become fast-path hits for
        // every subsequent request (also clears any stale tombstone).
        if (base && !viaFastPath) {
            await this.saveMapping(db, base, resolvedUid);
        }

        return {
            storeUid: resolvedUid,
            certificatePosition: data.settings?.certificatePosition || 'auto',
        };
    }

    /** True when `base` is a bare shared-platform origin (never map those). */
    private isBarePlatformBase(base: string): boolean {
        const stripped = base.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        return PLATFORM_PATH_HOSTS.has(stripped);
    }

    private async fastLookup(
        db: FirebaseFirestore.Firestore,
        parsed: ParsedHref,
    ): Promise<FirebaseFirestore.DocumentSnapshot | 'tombstone' | null> {
        const { base, host, isPlatformPath } = parsed;
        const keys = [this.encodeUrlForFirestore(base)];
        if (isPlatformPath) {
            // Install-time mappings for path stores use legacy underscore
            // keys WITH the store segment (e.g. salla_sa_alool22,
            // salla_sa_perfect-perfume_com). Segment-bearing keys are safe
            // — only bare-host keys are the poison pattern.
            const seg = base.substring(base.indexOf('/', 8) + 1);
            const bareHost = host.replace(/^www\./, '');
            const underscore = (s: string) => s.replace(/\./g, '_').replace(/\//g, '_');
            keys.push(this.encodeUrlForFirestore(`${bareHost}/${seg}`));
            keys.push(underscore(`${bareHost}/${seg}`));
            keys.push(underscore(`www.${bareHost}/${seg}`));
        } else {
            // Bare-host keys are only safe for dedicated domains.
            keys.push(host.replace(/\./g, '_'));
            keys.push(host.replace(/^www\./, '').replace(/\./g, '_'));
        }
        const uniqueKeys = keys.filter((k, i, arr) => k && arr.indexOf(k) === i);
        const canonicalKey = uniqueKeys[0];

        // Scan ALL keys; a positive mapping anywhere beats a tombstone —
        // otherwise a stale tombstone at the canonical key would shadow a
        // valid legacy-format mapping forever.
        let sawActiveTombstone = false;
        for (const key of uniqueKeys) {
            let snap: FirebaseFirestore.DocumentSnapshot;
            try {
                snap = await db.collection('domains').doc(key).get();
            } catch { continue; }
            if (!snap.exists) continue;

            const d = snap.data() as { storeUid?: string; uid?: string; notFound?: boolean; until?: number } | undefined;
            if (d?.notFound) {
                if ((d.until || 0) > Date.now()) sawActiveTombstone = true;
                continue;
            }
            const uid = d?.storeUid || d?.uid;
            if (!uid) continue;
            // Bare-platform mappings are poison (one store claiming the
            // whole shared host) — never honor them.
            if (this.isBarePlatformBase(String((d as { base?: string })?.base || base))) continue;

            const storeDoc = await db.collection('stores').doc(uid).get();
            if (storeDoc.exists) {
                // Legacy-format key hit: also save under the canonical key
                // (overwrites any tombstone) so future lookups match on
                // the first doc get.
                if (key !== canonicalKey) {
                    await this.saveMapping(db, base, uid);
                }
                return storeDoc;
            }
        }
        return sawActiveTombstone ? 'tombstone' : null;
    }

    private async writeTombstone(db: FirebaseFirestore.Firestore, base: string): Promise<void> {
        if (this.isBarePlatformBase(base)) return;
        try {
            await db.collection('domains').doc(this.encodeUrlForFirestore(base)).set({
                base,
                notFound: true,
                until: Date.now() + TOMBSTONE_TTL_MS,
                updatedAt: Date.now(),
            }, { merge: true });
        } catch { /* negative cache is best-effort */ }
    }

    private async saveMapping(
        db: FirebaseFirestore.Firestore,
        base: string,
        storeUid: string,
    ): Promise<void> {
        if (this.isBarePlatformBase(base)) return;
        try {
            const key = this.encodeUrlForFirestore(base);
            await db.collection('domains').doc(key).set({
                base,
                key,
                uid: storeUid,
                storeUid,
                notFound: false,
                until: 0,
                autoMapped: true,
                updatedAt: Date.now(),
            }, { merge: true });
        } catch { /* mapping cache is best-effort */ }
    }

    private async lookupFromDomainsCollection(
        db: FirebaseFirestore.Firestore,
        base: string,
        hrefUrl: URL | null,
        host: string,
        isPlatformPath: boolean = false
    ): Promise<FirebaseFirestore.DocumentSnapshot | null> {
        try {
            // Try multiple key formats since they may vary.
            // Platform-path stores (salla.sa/<store>) must only match keys
            // that include the store segment — a bare-host doc on a shared
            // platform host would map EVERY store on it to one store.
            const keysToTry = (isPlatformPath
                ? [
                    this.encodeUrlForFirestore(base),  // URL-encoded format (includes segment)
                    base,  // Raw base (includes segment)
                ]
                : [
                    this.encodeUrlForFirestore(base),  // URL-encoded format
                    base,  // Raw base
                    host.replace(/\./g, '_').toLowerCase(),  // Underscore format (pointstylishes_com)
                    `www_${host.replace(/^www\./, '').replace(/\./g, '_').toLowerCase()}`,  // www variant
                    host.replace(/^www\./, '').replace(/\./g, '_').toLowerCase(),  // Non-www variant
                ]).filter((k, i, arr) => k && arr.indexOf(k) === i);

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
                const d = domainDoc.data() as { storeUid?: string; uid?: string; notFound?: boolean } | undefined;
                const fromUid = !d?.notFound ? (d?.storeUid || d?.uid) : undefined;
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
