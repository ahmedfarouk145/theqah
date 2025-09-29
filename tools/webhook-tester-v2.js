#!/usr/bin/env node

/**
 * Salla Webhook Tester v2 - Simplified and Clean
 * 
 * Usage:
 * 1. Set environment variables:
 *    - TARGET: webhook endpoint URL
 *    - SALLA_WEBHOOK_SECRET: signing secret
 *    - MERCHANT_ID: store merchant ID
 * 
 * 2. Run tests:
 *    node tools/webhook-tester-v2.js [event-type]
 * 
 * Available events: install, order, payment, status, cancel, refund, uninstall
 */
import { createHmac } from 'crypto';

// Configuration from environment
const TARGET = process.env.TARGET || 'http://localhost:3000/api/salla/webhook-v2';
const SECRET = process.env.SALLA_WEBHOOK_SECRET || 'test-secret';
const MERCHANT_ID = process.env.MERCHANT_ID || '559541722';

// Sample data templates
const SAMPLE_CUSTOMER = {
  id: 123456,
  name: 'أحمد محمد العلي',
  email: 'ahmed@example.com',
  mobile: '+966555123456'
};

const SAMPLE_ORDER = {
  id: Math.floor(Math.random() * 1000000),
  number: `ORD-${Date.now()}`,
  status: 'pending',
  payment_status: 'pending',
  customer: SAMPLE_CUSTOMER,
  items: [
    {
      id: 789,
      name: 'منتج تجريبي',
      price: 99.99,
      quantity: 2
    }
  ]
};

// Event templates
const EVENT_TEMPLATES = {
  install: {
    event: 'app.installed',
    merchant: MERCHANT_ID,
    data: {
      app_id: 'test-app',
      store: {
        id: MERCHANT_ID,
        name: 'متجر التجربة',
        domain: 'demostore.salla.sa'
      },
      installed_at: new Date().toISOString()
    }
  },

  order: {
    event: 'order.created',
    merchant: MERCHANT_ID,
    data: SAMPLE_ORDER
  },

  payment: {
    event: 'order.payment.updated',
    merchant: MERCHANT_ID,
    data: {
      ...SAMPLE_ORDER,
      payment_status: 'paid'
    }
  },

  status: {
    event: 'order.status.updated',
    merchant: MERCHANT_ID,
    data: {
      ...SAMPLE_ORDER,
      status: 'processing'
    }
  },

  cancel: {
    event: 'order.cancelled',
    merchant: MERCHANT_ID,
    data: {
      ...SAMPLE_ORDER,
      status: 'cancelled'
    }
  },

  refund: {
    event: 'order.refunded',
    merchant: MERCHANT_ID,
    data: {
      ...SAMPLE_ORDER,
      status: 'refunded',
      payment_status: 'refunded'
    }
  },

  uninstall: {
    event: 'app.uninstalled',
    merchant: MERCHANT_ID,
    data: {
      app_id: 'test-app',
      store: {
        id: MERCHANT_ID,
        name: 'متجر التجربة'
      },
      uninstalled_at: new Date().toISOString()
    }
  }
};

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function sendWebhook(eventType) {
  const template = EVENT_TEMPLATES[eventType];
  if (!template) {
    console.error(`❌ Unknown event type: ${eventType}`);
    console.log(`Available events: ${Object.keys(EVENT_TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  const payload = JSON.stringify(template);
  const signature = signPayload(payload, SECRET);

  console.log(`🚀 Sending ${template.event} webhook to ${TARGET}`);
  console.log(`📦 Payload:`, JSON.stringify(template, null, 2));

  try {
    const response = await fetch(TARGET, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Salla-Signature': signature,
        'User-Agent': 'Salla-Webhook-Tester-v2'
      },
      body: payload
    });

    const responseText = await response.text();
    
    console.log(`\n📨 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📨 Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (responseText) {
      try {
        const jsonResponse = JSON.parse(responseText);
        console.log(`📨 Response Body:`, JSON.stringify(jsonResponse, null, 2));
      } catch {
        console.log(`📨 Response Body: ${responseText}`);
      }
    }

    if (response.ok) {
      console.log(`✅ Webhook sent successfully!`);
    } else {
      console.log(`❌ Webhook failed with status ${response.status}`);
    }

  } catch (error) {
    console.error(`💥 Error sending webhook:`, error.message);
    process.exit(1);
  }
}

async function runAllTests() {
  console.log(`🧪 Running all webhook tests...\n`);
  
  const events = ['install', 'order', 'payment', 'status'];
  
  for (const event of events) {
    await sendWebhook(event);
    console.log(`\n${'='.repeat(50)}\n`);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`🎉 All tests completed!`);
}

// Main execution
async function main() {
  const eventType = process.argv[2];

  console.log(`🔧 Configuration:`);
  console.log(`   Target: ${TARGET}`);
  console.log(`   Secret: ${SECRET.substring(0, 8)}...`);
  console.log(`   Merchant: ${MERCHANT_ID}\n`);

  if (!eventType || eventType === 'all') {
    await runAllTests();
  } else {
    await sendWebhook(eventType);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Webhook tester stopped');
  process.exit(0);
});

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});
