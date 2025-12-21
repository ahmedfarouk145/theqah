
import { loadEnvConfig } from '@next/env';
import { dbAdmin } from '../src/lib/firebaseAdmin';

// Load environment variables from .env.local
loadEnvConfig(process.cwd());

async function run() {
    console.log('Starting Salla API Test...');

    const storeUid = 'salla:982747175';
    console.log(`Fetching token for store: ${storeUid}`);

    try {
        // Initialize Firestore
        const db = dbAdmin();

        const ownerDoc = await db.collection('owners').doc(storeUid).get();

        if (!ownerDoc.exists) {
            console.error('❌ Owner document not found in Firestore');
            return;
        }

        const token = ownerDoc.data()?.oauth?.access_token;
        if (!token) {
            console.error('❌ No access token found in owner document');
            return;
        }

        console.log('✅ Access token retrieved. Querying Salla API...');

        const apiUrl = 'https://api.salla.dev/admin/v2/reviews?per_page=100';
        const res = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json'
            }
        });

        console.log(`API Response Status: ${res.status} ${res.statusText}`);

        if (!res.ok) {
            console.error(`❌ API Error: ${await res.text()}`);
            return;
        }

        const data = await res.json();
        console.log(`Total reviews returned: ${data.data?.length}`);

        if (data.data && data.data.length > 0) {
            console.log('\n--- SAMPLE REVIEW STRUCTURE ---');
            console.log(JSON.stringify(data.data[0], null, 2));

            console.log('\n--- ALL ORDER IDs ---');
            // Simple mapping for clarity
            const summary = data.data.map((r: any) => ({
                id: r.id,
                order_id: r.order_id,
                type: r.type,
                product_id: r.product_id || r.product?.id || r.product?.product_id
            }));
            console.table(summary);
        } else {
            console.log('⚠️ No reviews found.');
            console.log('Full response payload:', JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error('❌ Script failed:', error);
        console.error(error);
    }
}

run();
