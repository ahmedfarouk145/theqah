// src/pages/store/[storeUid]/certificate.tsx
//
// Public "certificate" view of a store's reviews — the page the
// certificate logo (widget footer) links to. This route exists to
// enforce a *server-side* star floor: unlike the prior implementation
// which used `/reviews?minStars=4` (bypassable by anyone editing the
// URL), the floor here is baked into the route itself. There is no
// query param to tamper with.
//
// The page component is reused from `./reviews` — only the data
// fetching (and the stars filter) differs.

import type { GetServerSideProps } from "next";
import StoreReviewsPage, {
    fetchStoreReviewsProps,
    type StoreReviewsPageProps,
    type StoreProfile,
} from "./reviews";

/**
 * Minimum star rating required for a review to appear on the
 * certificate page. Must be enforced server-side — do not expose as
 * a query parameter.
 */
const CERTIFICATE_MIN_STARS = 4;

export const getServerSideProps: GetServerSideProps<StoreReviewsPageProps> = async (ctx) => {
    const result = await fetchStoreReviewsProps(ctx, { redirectBase: "/certificate" });

    // Redirects and error-prop responses pass through untouched — we only
    // need to post-process the success case where we actually got a profile.
    if ("redirect" in result || "notFound" in result) {
        return result;
    }

    const props = await Promise.resolve(result.props);
    if (!props.profile) {
        return { props };
    }

    const filteredProfile: StoreProfile = {
        ...props.profile,
        reviews: props.profile.reviews.filter((r) => r.stars >= CERTIFICATE_MIN_STARS),
    };

    return {
        props: {
            ...props,
            profile: filteredProfile,
        },
    };
};

export default StoreReviewsPage;
