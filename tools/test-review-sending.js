/*
  Review Sending Tester - اختبار إرسال دعوات المراجعة

  Usage:
    STORE_UID=salla:559541722 \
    CUSTOMER_EMAIL=test@example.com \
    CUSTOMER_PHONE=+966555555555 \
    CUSTOMER_NAME="أحمد محمد" \
    STORE_NAME="متجر التجربة" \
    node tools/test-review-sending.js

  Optional env vars:
    TEST_MODE=email|sms|both (default: both)
    ORDER_ID=12345 (default: random)
    PRODUCT_ID=P123 (default: random)
    APP_BASE_URL=https://your-domain.com (for review URL)
    TIMEOUT_MS=15000 (timeout per channel)
*/

/* eslint-disable no-console */
//eslint-disable-next-line 
const crypto = require('crypto');

// Mock Firebase Admin (since we're testing the messaging part)
const mockDb = {
  collection: (name) => ({
    doc: (id) => ({
      set: async (data) => {
        console.log(`[MOCK DB] ${name}/${id} set:`, JSON.stringify(data, null, 2));
        return { id };
      }
    }),
    add: async (data) => {
      const id = crypto.randomBytes(8).toString('hex');
      console.log(`[MOCK DB] ${name} add ${id}:`, JSON.stringify(data, null, 2));
      return { id };
    }
  })
};

// Environment setup
const env = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === null || String(v).trim() === '' ? fallback : String(v).trim();
};

const STORE_UID = env('STORE_UID', 'salla:TEST_STORE');
const CUSTOMER_EMAIL = env('CUSTOMER_EMAIL', '');
const CUSTOMER_PHONE = env('CUSTOMER_PHONE', '');
const CUSTOMER_NAME = env('CUSTOMER_NAME', 'عميل تجريبي');
const STORE_NAME = env('STORE_NAME', 'المتجر التجريبي');
const TEST_MODE = env('TEST_MODE', 'both'); // email | sms | both
const ORDER_ID = env('ORDER_ID', Math.floor(100000 + Math.random() * 900000).toString());
const PRODUCT_ID = env('PRODUCT_ID', 'P' + Math.floor(100 + Math.random() * 900));
const APP_BASE_URL = env('APP_BASE_URL', 'https://theqah.vercel.app').replace(/\/+$/, '');
const TIMEOUT_MS = parseInt(env('TIMEOUT_MS', '15000'));

console.log('\n🧪 Review Sending Tester');
console.log('=========================');
console.log(`Store: ${STORE_UID}`);
console.log(`Customer: ${CUSTOMER_NAME}`);
console.log(`Email: ${CUSTOMER_EMAIL || 'NOT PROVIDED'}`);
console.log(`Phone: ${CUSTOMER_PHONE || 'NOT PROVIDED'}`);
console.log(`Store Name: ${STORE_NAME}`);
console.log(`Test Mode: ${TEST_MODE}`);
console.log(`Order ID: ${ORDER_ID}`);
console.log(`Product ID: ${PRODUCT_ID}`);
console.log(`Base URL: ${APP_BASE_URL}`);
console.log(`Timeout: ${TIMEOUT_MS}ms\n`);

if (!CUSTOMER_EMAIL && !CUSTOMER_PHONE) {
  console.error('❌ Error: Must provide either CUSTOMER_EMAIL or CUSTOMER_PHONE');
  process.exit(1);
}

async function testReviewCreationAndSending() {
  try {
    // Generate review token and URL (simulating webhook logic)
    const tokenId = crypto.randomBytes(10).toString('hex');
    const reviewUrl = `${APP_BASE_URL}/review/${tokenId}`;
    const publicUrl = reviewUrl;

    console.log('📝 Creating review token...');
    
    // Mock creating review_tokens document
    await mockDb.collection("review_tokens").doc(tokenId).set({
      id: tokenId,
      platform: "salla",
      orderId: ORDER_ID,
      storeUid: STORE_UID,
      productId: PRODUCT_ID,
      productIds: [PRODUCT_ID],
      createdAt: Date.now(),
      usedAt: null,
      publicUrl,
      targetUrl: reviewUrl,
      channel: "multi",
    });

    // Mock creating review_invites document
    await mockDb.collection("review_invites").doc(tokenId).set({
      tokenId,
      orderId: ORDER_ID,
      platform: "salla",
      storeUid: STORE_UID,
      productId: PRODUCT_ID,
      productIds: [PRODUCT_ID],
      customer: { 
        name: CUSTOMER_NAME, 
        email: CUSTOMER_EMAIL || null, 
        mobile: CUSTOMER_PHONE || null 
      },
      sentAt: Date.now(),
      deliveredAt: null,
      clicks: 0,
      publicUrl,
    });

    console.log(`✅ Mock review token created: ${tokenId}`);
    console.log(`🔗 Review URL: ${publicUrl}\n`);

    // Test the actual sending (import your real sender)
    console.log('📤 Testing message sending...');
    
    try {
      // استخدم الاستيراد الديناميكي الحديث
      const { sendBothNow } = await import('../src/server/messaging/send-invite.js');

      const sendResult = await sendBothNow({
        inviteId: tokenId,
        phone: CUSTOMER_PHONE || undefined,
        email: CUSTOMER_EMAIL || undefined,
        customerName: CUSTOMER_NAME,
        storeName: STORE_NAME,
        url: publicUrl,
        perChannelTimeoutMs: TIMEOUT_MS,
      });

      console.log('📊 Sending Results:');
      console.log(JSON.stringify(sendResult, null, 2));

      // Check results
      const emailSent = sendResult.email?.success;
      const smsSent = sendResult.sms?.success;
      
      console.log('\n📈 Summary:');
      if (CUSTOMER_EMAIL) {
        console.log(`📧 Email to ${CUSTOMER_EMAIL}: ${emailSent ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (!emailSent && sendResult.email?.error) {
          console.log(`   Error: ${sendResult.email.error}`);
        }
      }
      
      if (CUSTOMER_PHONE) {
        console.log(`📱 SMS to ${CUSTOMER_PHONE}: ${smsSent ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (!smsSent && sendResult.sms?.error) {
          console.log(`   Error: ${sendResult.sms.error}`);
        }
      }

      console.log(`\n🎯 Review Link: ${publicUrl}`);
      
    } catch (importError) {
      console.error('❌ Could not import sendBothNow function:');
      console.error(importError.message);
      console.log('\n🔧 To fix this:');
      console.log('1. Make sure you\'re running from the project root');
      console.log('2. Ensure src/server/messaging/send-invite.js exports sendBothNow');
      console.log('3. Install dependencies: npm install');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    await testReviewCreationAndSending();
    console.log('\n✅ Test completed!');
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

main();
