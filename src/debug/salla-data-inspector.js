// Debug tool to inspect Salla webhook data
// Add this to your webhook handler temporarily for debugging

function logSallaData(webhookData, event) {
  console.log(`\n🔍 [SALLA DEBUG] Event: ${event}`);
  console.log('📊 Full Payload:', JSON.stringify(webhookData, null, 2));
  
  const data = webhookData.data || {};
  
  console.log('\n📋 Data Structure Analysis:');
  console.log('- event:', webhookData.event);
  console.log('- merchant:', webhookData.merchant);
  console.log('- created_at:', webhookData.created_at);
  
  console.log('\n📦 Order Data:');
  console.log('- order.id:', data.id);
  console.log('- order.order_id:', data.order_id);
  console.log('- order.number:', data.number);
  console.log('- order.status:', data.status);
  console.log('- order.order_status:', data.order_status);
  console.log('- order.payment_status:', data.payment_status);
  
  console.log('\n👤 Customer Data:');
  if (data.customer) {
    console.log('- customer.name:', data.customer.name);
    console.log('- customer.email:', data.customer.email);
    console.log('- customer.mobile:', data.customer.mobile);
  }
  
  console.log('\n🏪 Store/Merchant Data:');
  if (data.store) {
    console.log('- store.id:', data.store.id);
    console.log('- store.name:', data.store.name);
    console.log('- store.domain:', data.store.domain);
  }
  if (data.merchant) {
    console.log('- merchant.id:', data.merchant.id);
    console.log('- merchant.name:', data.merchant.name);
    console.log('- merchant.domain:', data.merchant.domain);
  }
  
  console.log('\n🛍️ Items Data:');
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item, index) => {
      console.log(`- items[${index}]:`, {
        id: item.id,
        product_id: item.product_id,
        product_id_nested: item.product?.id
      });
    });
  }
  
  console.log('\n🌐 Domain Sources:');
  console.log('- domain:', data.domain);
  console.log('- store_url:', data.store_url);
  console.log('- url:', data.url);
  console.log('- store.domain:', data.store?.domain);
  console.log('- merchant.domain:', data.merchant?.domain);
  
  console.log('\n' + '='.repeat(60));
}

// Usage in your webhook handler:
// const body = JSON.parse(raw.toString("utf8") || "{}");
// logSallaData(body, event); // Add this line after parsing
