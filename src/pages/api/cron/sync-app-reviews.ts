// src/pages/api/cron/sync-app-reviews.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { RepositoryFactory } from "@/server/repositories";
import { resolveStoreDisplayName, resolveStoreDomainValue } from "@/server/services/admin.service";
import type { Store } from "@/server/core/types";

const SALLA_APP_ID = "1180703836";
const SALLA_API_URL = `https://api.salla.dev/marketplace/v1/app/${SALLA_APP_ID}`;

interface SallaReview {
    id?: number;
    name?: string;
    avatar?: string | null;
    rating?: number;
    comment?: string | null;
    date?: string;
}

/** Normalize an Arabic/Latin store name for fuzzy comparison.
 *  Lowercases Latin, collapses whitespace; leaves Arabic glyphs intact.
 */
function normalizeName(s: string | null | undefined): string {
    return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match a Salla review's reviewer name against installed stores.
 *  Strategy: collect all name matches (exact-normalized first, then substring),
 *  then prefer the match that has a resolvable domain. This handles the case
 *  where the same store appears twice in `stores` (e.g. an orphan record from
 *  an older oauth flow with NULL domain, plus the canonical `salla:{id}` doc
 *  with the real domain).
 */
function matchStoreForReview(reviewName: string, stores: Store[]): Store | null {
    const target = normalizeName(reviewName);
    if (!target) return null;

    const exactMatches: Store[] = [];
    const substringMatches: Store[] = [];

    for (const store of stores) {
        const displayName = normalizeName(resolveStoreDisplayName(store as unknown as Record<string, unknown>));
        if (!displayName) continue;
        if (displayName === target) {
            exactMatches.push(store);
        } else if (target.includes(displayName) || displayName.includes(target)) {
            substringMatches.push(store);
        }
    }

    // Within each tier, prefer matches with a real domain over orphan/NULL-domain duplicates.
    const pickWithDomain = (list: Store[]): Store | null => {
        const withDomain = list.find((s) => !!resolveStoreDomainValue(s as unknown as Record<string, unknown>));
        return withDomain || list[0] || null;
    };

    return pickWithDomain(exactMatches) || pickWithDomain(substringMatches);
}

/**
 * Cron job: Sync app reviews from Salla marketplace API
 * Schedule: Once daily at 6 AM
 *
 * Fetches latest_reviews from Salla's public API, matches each reviewer to
 * an installed store (to derive avatar + storeUrl), then saves to Firestore.
 * The landing page reads from Firestore via getStaticProps + ISR.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Invalid cron authorization" });
    }

    try {
        const response = await fetch(SALLA_API_URL, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return res.status(502).json({ error: "Salla API returned " + response.status });
        }

        const json = await response.json();
        const latestReviews: SallaReview[] = json?.data?.latest_reviews;

        if (!Array.isArray(latestReviews) || latestReviews.length === 0) {
            return res.status(200).json({ message: "No reviews found in Salla API", synced: 0 });
        }

        const reviewRepo = RepositoryFactory.getAppReviewRepository();
        const storeRepo = RepositoryFactory.getStoreRepository();

        // Load all installed stores once for name → domain lookup.
        // Acceptable for daily cron at current scale; revisit if stores > 10k.
        const allStores = await storeRepo.findAll();

        // Replace existing reviews with fresh data
        const existing = await reviewRepo.findAllActive();
        for (const r of existing) {
            if (r.id) await reviewRepo.delete(r.id);
        }

        let synced = 0;
        let matched = 0;
        for (const r of latestReviews) {
            const reviewName = r.name || "متجر";
            const matchedStore = matchStoreForReview(reviewName, allStores);

            let storeUrl: string | null = null;
            if (matchedStore) {
                const domain = resolveStoreDomainValue(matchedStore as unknown as Record<string, unknown>);
                if (domain) {
                    // Prepend https:// if the stored value is a bare host
                    storeUrl = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
                    matched++;
                }
            }

            await reviewRepo.create({
                storeName: reviewName,
                stars: r.rating || 5,
                text: r.comment || "",
                reviewDate: r.date || new Date().toISOString(),
                source: "salla",
                avatar: r.avatar || null,
                storeUrl,
            });
            synced++;
        }

        return res.status(200).json({
            synced,
            matched,
            unmatched: synced - matched,
            total: latestReviews.length,
        });
    } catch (error) {
        return res.status(500).json({ error: "Sync failed", details: String(error) });
    }
}
