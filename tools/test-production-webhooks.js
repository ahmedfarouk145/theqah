// Production webhook testing for Vercel deployment

const { createHmac } = require('crypto');

// Your production Vercel URL
const PRODUCTION_URL = 'https://theqah.com.sa'; // Update this with your actual domain
const DEBUG_SECRET = 'your-debug-key'; // Set this in Vercel env vars

const samplePayload = {
  event: "order.payment.updated",
  merchant: "123456789",
  created_at: new Date().toISOString(),
  data: {
    id: "ORD-TEST-" + Date.now(),
    order_id: "ORD-TEST-" + Date.now(),
    payment_status: "paid",
    status: "paid",
    customer: {
      name: "عبدالله أحمد",
      email: "abdullah@example.com",
      mobile: "+966501234567"
    },
    items: [
      {
        id: "ITEM-001",
        product_id: "PROD-123",
        product: {
          id: "PROD-123",
          name: "منتج تجريبي"
        }
      }
    ],
    store: {
      id: "123456789",
      name: "متجر تجريبي",
      domain: "test-store.salla.sa"
    }
  }
};

function generateSignature(payload, secret = 'test_secret') {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function testProductionWebhook(payload = samplePayload) {
  const jsonPayload = JSON.stringify(payload);
  const signature = generateSignature(jsonPayload, 'test_secret'); // Use your Salla webhook secret
  
  console.log('🚀 Testing Production Webhook...');
  console.log(`📡 URL: ${PRODUCTION_URL}/api/salla/webhook`);
  console.log(`📦 Payload Size: ${jsonPayload.length} bytes`);
  console.log(`🔐 Signature: ${signature.substring(0, 16)}...`);
  
  try {
    const response = await fetch(`${PRODUCTION_URL}/api/salla/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Salla-Signature': signature,
        'X-Salla-Security-Strategy': 'signature',
        'User-Agent': 'Salla/Webhook-Test-v1.0',
      },
      body: jsonPayload,
    });
    
    const responseText = await response.text();
    
    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📄 Response Body: ${responseText}`);
    console.log(`⏱️ Content-Length: ${response.headers.get('content-length')}`);
    
    if (!response.ok) {
      console.error(`❌ Webhook failed with status ${response.status}`);
      
      // Try to parse error details
      try {
        let errorDetail = responseText;
        if (response.headers.get('content-type')?.includes('application/json')) {
          const error = JSON.parse(responseText);
          errorDetail = error.error || error.message || JSON.stringify(error);
        }
        console.error(`🔍 Error Detail: ${errorDetail}`);
      } catch (e) {
        console.error(`📝 Raw Error: ${responseText}`);
      }
    } else {
      console.log('✅ Webhook test successful!');
    }
    
    return {
      success: response.ok,
      status: response.status,
      response: responseText,
    };
    
  } catch (error) {
    console.error('❌ Network Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testDebugEndpoint() {
  console.log('\n🔧 Testing Debug Endpoint...');
  
  const debugUrl = `${PRODUCTION_URL}/api/debug/salla-status?key=${DEBUG_SECRET}`;
  
  try {
    const response = await fetch(debugUrl);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Debug endpoint accessible');
      console.log(`📊 Status Summary:`, data.stats);
      
      if (data.failedWebhooks.length > 0) {
        console.log(`❌ Recent Failed Webhooks:`, data.failedWebhooks);
      }
      
      if (data.recentErrors.length > 0) {
        console.log(`🚨 Recent Errors:`, data.recentErrors);
      }
      
      console.log(`🌍 Environment Check:`, data.environment);
      
      return data;
    } else {
      console.log(`❌ Debug endpoint failed: ${response.status}`);
      console.log(`📄 Response:`, data);
    }
  } catch (error) {
    console.error('❌ Debug endpoint error:', error.message);
  }
}

async function checkHealthEndpoint() {
  console.log('\n🏥 Checking Health Status...');
  
  const healthUrl = `${PRODUCTION_URL}/api/_admin/ping?key=${DEBUG_SECRET}`;
  
  try {
    const response = await fetch(healthUrl);
    const text = await response.text();
    
    console.log(`📊 Health Status: ${response.status}`);
    console.log(`📄 Response: ${text}`);
    
    return response.ok;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function runProductionDiagnostics() {
  console.log('🏭 Vercel Production Diagnostics for Salla Webhooks\n');
  console.log(`🌐 Production URL: ${PRODUCTION_URL}`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}\n`);
  
  console.log('=' .repeat(60));
  
  // Test health first
  const healthOk = await checkHealthEndpoint();
  if (!healthOk) {
    console.error('❌ Basic health check failed. Site may be down.');
    return;
  }
  
  // Test debug endpoint
  await testDebugEndpoint();
  
  console.log('=' .repeat(60));
  
  // Test webhook
  await testProductionWebhook();
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Check Vercel Function logs in dashboard');
  console.log('2. Review Firebase collections for errors');
  console.log('3. Verify Salla webhook configuration');
  console.log('4. Check environment variables on Vercel');
}

// Run diagnostics if called directly
if (require.main === module) {
  runProductionDiagnostics().catch(console.log);
}

module.exports = {
  testProductionWebhook,
  testDebugEndpoint,
  checkHealthEndpoint,
  runProductionDiagnostics,
};
