// Test tool for Salla webhook debugging
//eslint-disable-next-line
const crypto = require('crypto');

// Sample Salla webhook payloads for testing
const samplePayloads = {
  'order.payment.updated': {
    "event": "order.payment.updated",
    "merchant": "123456789",
    "created_at": "2025-01-01T10:00:00Z",
    "data": {
      "id": "ORD-2025-001",
      "order_id": "ORD-2025-001",
      "payment_status": "paid",
      "status": "paid",
      "customer": {
        "name": "أحمد محمد",
        "email": "ahmed@example.com",
        "mobile": "+966501234567"
      },
      "items": [
        {
          "id": "ITEM-001",
          "product_id": "PROD-123",
          "product": {
            "id": "PROD-123",
            "name": "منتج تجريبي"
          }
        }
      ],
      "store": {
        "id": "123456789",
        "name": "متجر تجريبي",
        "domain": "demo-store.salla.sa"
      }
    }
  },
  
  'app.store.authorize': {
    "event": "app.store.authorize",
    "merchant": "123456789",
    "created_at": "2025-01-01T10:00:00Z",
    "data": {
      "access_token": "sk_test_token123",
      "refresh_token": "rt_test_token123",
      "domain": "demo-store.salla.sa",
      "store_url": "https://demo-store.salla.sa",
      "scope": "offline,orders,products",
      "expires": 3600
    }
  },
  
  'shipment.updated': {
    "event": "shipment.updated",
    "merchant": "123456789",
    "created_at": "2025-01-01T10:00:00Z",
    "data": {
      "id": "ORD-2025-001",
      "order_id": "ORD-2025-001",
      "status": "delivered",
      "shipment_status": "delivered",
      "payment_status": "paid",
      "customer": {
        "name": "أحمد محمد",
        "email": "ahmed@example.com",
        "mobile": "+966501234567"
      },
      "items": [],
      "merchant": {
        "id": "123456789",
        "name": "متجر تجريبي",
        "domain": "demo-store.salla.sa"
      }
    }
  }
};

// Generate webhook signature
function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Test webhook endpoint
async function testWebhook(eventType, baseUrl = 'http://localhost:3000') {
  const payload = samplePayloads[eventType];
  if (!payload) {
    console.error(`Unknown event type: ${eventType}`);
    return;
  }
  
  const jsonPayload = JSON.stringify(payload);
  const secret = process.env.SALLA_WEBHOOK_SECRET || 'test_secret';
  const signature = generateSignature(jsonPayload, secret);
  
  const url = `${ baseUrl}/api/salla/webhook`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Salla-Signature': signature,
      'X-Salla-Security-Strategy': 'signature',
    },
    body: jsonPayload,
  });
  
  console.log(`\n🚀 Testing webhook: ${eventType}`);
  console.log(`📡 URL: ${url}`);
  console.log(`📊 Status: ${response.status} ${response.statusText}`);
  console.log(`📄 Response:`, await response.text());
  
  return response;
}

// Enhanced data validation
function validateSallaPayload(payload) {
  const requiredFields = ['event', 'merchant'];
  const missing = requiredFields.filter(field => !payload[field]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required fields: ${missing.join(', ')}`);
    return false;
  }
  
  console.log(`✅ Basic validation passed for event: ${payload.event}`);
  
  // Validate data structure based on event type
  if (!payload.data || typeof payload.data !== 'object') {
    console.error('❌ Missing or invalid data field');
    return false;
  }
  
  const data = payload.data;
  
  // Order-related events
  if (payload.event.startsWith('order.') || payload.event.startsWith('shipment.')) {
    const orderFields = ['id', 'order_id'];
    const hasOrderId = orderFields.some(field => data[field]);
    
    if (!hasOrderId) {
      console.error('❌ Order ID missing in order/shipment event');
      return false;
    }
    
    console.log(`✅ Order ID found: ${data.id || data.order_id}`);
  }
  
  // App authorization events
  if (payload.event.startsWith('app.')) {
    if (!data.access_token) {
      console.error('❌ Access token missing in app event');
      return false;
    }
    console.log('✅ Access token present');
  }
  
  return true;
}

// Test all sample payloads
async function runAllTests(baseUrl) {
  console.log('🧪 Starting Salla webhook tests...\n');
  
  for (const eventType of Object.keys(samplePayloads)) {
    const payload = samplePayloads[eventType];
    
    console.log(`\n📋 Validating payload: ${eventType}`);
    validateSallaPayload(payload);
    
    console.log(`📊 Payload structure:`, {
      event: payload.event,
      merchant: payload.merchant,
      dataKeys: Object.keys(payload.data || {}),
      created_at: payload.created_at
    });
  }
  
  console.log('\n🌐 Testing webhook endpoints...');
  
  for (const eventType of Object.keys(samplePayloads)) {
    try {
      await testWebhook(eventType, baseUrl);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    } catch (error) {
      console.error(`❌ Test failed for ${eventType}:`, error.message);
    }
  }
  
  console.log('\n✅ Tests completed!');
}

// Run tests if called directly
if (require.main === module) {
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  runAllTests(baseUrl).catch(console.error);
}

module.exports = {
  testWebhook,
  validateSallaPayload,
  samplePayloads,
  runAllTests,
};
