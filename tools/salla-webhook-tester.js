/*
  Salla Webhook Tester – end-to-end smoke tests

  Usage:
    TARGET=https://<your-domain>/api/salla/webhook \
    SALLA_WEBHOOK_SECRET=xxxx \
    MERCHANT_ID=559541722 \
    node tools/salla-webhook-tester.js

  Optional:
    RUN=all|install|order|status|payment|dup
    TOKEN=....   // to test token strategy (Authorization: Bearer TOKEN)

  Notes:
    - Signs the request body with HMAC-SHA256 like Salla does
    - Logs status + response body and highlights failures
*/

/* eslint-disable no-console */
//eslint-disable-next-line
const crypto = require('crypto');
//eslint-disable-next-line
const axios = require('axios');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === null || String(v).trim() === '' ? fallback : String(v);
}

const TARGET = env('TARGET', 'http://localhost:3000/api/salla/webhook');
const SECRET = env('SALLA_WEBHOOK_SECRET', 'dev-secret-change-me');
const MERCHANT_ID = env('MERCHANT_ID', '1001');
const RUN = env('RUN', 'all');
const TOKEN = env('TOKEN', '');

function signBody(raw) {
  return crypto.createHmac('sha256', SECRET).update(Buffer.from(raw, 'utf8')).digest('hex');
}

async function postSigned(payload) {
  const raw = JSON.stringify(payload);
  const sig = signBody(raw);
  const headers = {
    'content-type': 'application/json',
    'x-salla-security-strategy': 'signature',
    'x-salla-signature': sig,
  };
  if (TOKEN) headers['authorization'] = `Bearer ${TOKEN}`;

  const started = Date.now();
  try {
    const res = await axios.post(TARGET, raw, {
      headers,
      timeout: 15000,
      validateStatus: () => true,
      transformRequest: [(d) => d],
    });
    const ms = Date.now() - started;
    console.log(`\n[HTTP ${res.status}] ${payload.event} in ${ms}ms`);
    console.log('Response:', typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
    if (res.status >= 400) {
      console.error('❌ Request failed');
    } else {
      console.log('✅ OK');
    }
    return res.status;
  } catch (e) {
    const ms = Date.now() - started;
    console.error(`\n[HTTP ERROR] ${payload.event} in ${ms}ms`);
    console.error(e.message);
    return 0;
  }
}

function sampleOrderBase() {
  return {
    id: Math.floor(100000000 + Math.random() * 900000000),
    number: String(Math.floor(100000 + Math.random() * 900000)),
    status: 'created',
    payment_status: 'unpaid',
    customer: { name: 'Test Customer', email: 'test@example.com', mobile: '0555555555' },
    items: [
      { id: '1', product_id: 'P100' },
      { id: '2', product_id: 'P200' },
    ],
    store: { id: MERCHANT_ID, domain: 'https://demostore.salla.sa/dev-abcdef', url: 'https://demostore.salla.sa' },
    merchant: { id: MERCHANT_ID, domain: 'https://demostore.salla.sa' },
  };
}

async function sendInstall() {
  const payload = {
    event: 'app.installed',
    merchant: MERCHANT_ID,
    data: {
      domain: 'https://demostore.salla.sa/dev-abcdef',
      access_token: 'fake-access-token-for-test',
      scope: 'read write',
    },
  };
  return postSigned(payload);
}

async function sendOrderCreated() {
  const order = sampleOrderBase();
  const payload = { event: 'order.created', merchant: MERCHANT_ID, data: order };
  return postSigned(payload);
}

async function sendOrderStatusDelivered(orderId) {
  const order = sampleOrderBase();
  if (orderId) order.id = orderId;
  order.status = 'delivered';
  const payload = { event: 'order.status.updated', merchant: MERCHANT_ID, data: order };
  return postSigned(payload);
}

async function sendPaymentPaid(orderId) {
  const order = sampleOrderBase();
  if (orderId) order.id = orderId;
  order.payment_status = 'paid';
  const payload = { event: 'order.payment.updated', merchant: MERCHANT_ID, data: order };
  return postSigned(payload);
}

async function sendDuplicate() {
  const order = sampleOrderBase();
  const payload = { event: 'order.created', merchant: MERCHANT_ID, data: order };
  // same raw two times → same signature → idemKey duplicate
  await postSigned(payload);
  await sleep(300);
  return postSigned(payload);
}

async function main() {
  console.log('Webhook Tester running...');
  console.log('TARGET =', TARGET);
  console.log('MERCHANT_ID =', MERCHANT_ID);
  console.log('RUN =', RUN);

  if (RUN === 'install' || RUN === 'all') {
    await sendInstall();
    await sleep(500);
  }

  let oid;
  if (RUN === 'order' || RUN === 'all') {
    oid = await sendOrderCreated();
    await sleep(500);
  }

  if (RUN === 'status' || RUN === 'all') {
    await sendOrderStatusDelivered();
    await sleep(500);
  }

  if (RUN === 'payment' || RUN === 'all') {
    await sendPaymentPaid(oid);
    await sleep(500);
  }

  if (RUN === 'dup' || RUN === 'all') {
    await sendDuplicate();
  }

  console.log('\nDone. Check your Vercel logs and Firestore collections.');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});


