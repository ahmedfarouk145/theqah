// tools/test-easy-mode.js
// اختبار Easy Mode للتسجيل والحصول على معلومات المستخدم

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// بيانات تجريبية للتسجيل
const testData = {
  merchantEmail: 'test@example.com',
  storeName: 'متجر التجربة للـ Easy Mode',
  storeUrl: 'https://demostore.salla.sa/dev-test123',
  merchantId: '559541722'
};

async function testEasyRegister() {
  console.log('🧪 اختبار Easy Mode Registration...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/stores/easy-register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    console.log('📝 Response Status:', response.status);
    console.log('📋 Response Data:', JSON.stringify(result, null, 2));
    
    if (result.success && result.accessToken) {
      console.log('\n✅ التسجيل نجح!');
      console.log('🔑 Access Token:', result.accessToken);
      console.log('🏪 Store UID:', result.storeUid);
      
      // اختبار Get User بالتوكن الجديد
      await testGetUser(result.accessToken);
    } else {
      console.log('\n❌ التسجيل فشل:', result.message);
    }
    
  } catch (error) {
    console.error('❌ خطأ في الاتصال:', error.message);
  }
}

async function testGetUser(accessToken) {
  console.log('\n🔍 اختبار Get User Information...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/stores/get-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessToken }),
    });

    const result = await response.json();
    
    console.log('📝 Response Status:', response.status);
    console.log('📋 User Data:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ جلب بيانات المستخدم نجح!');
      console.log('📊 معلومات المستخدم:');
      console.log(`   - المتجر: ${result.user.storeName}`);
      console.log(`   - البريد: ${result.user.merchantEmail}`);
      console.log(`   - الخطة: ${result.user.plan.code}`);
      console.log(`   - الاستخدام: ${result.user.usage.invitesUsed}/${result.user.usage.monthlyLimit}`);
    } else {
      console.log('\n❌ فشل جلب البيانات:', result.message);
    }
    
  } catch (error) {
    console.error('❌ خطأ في جلب البيانات:', error.message);
  }
}

// اختبار مع توكن موجود مسبقاً (اختياري)
async function testExistingToken() {
  const existingToken = process.env.TEST_TOKEN;
  
  if (!existingToken) {
    console.log('⚠️  لا يوجد TEST_TOKEN في environment variables');
    return;
  }
  
  console.log('\n🔄 اختبار توكن موجود...');
  await testGetUser(existingToken);
}

async function main() {
  console.log('🚀 بدء اختبار Easy Mode System\n');
  console.log('🌐 Base URL:', BASE_URL);
  console.log('📧 Test Email:', testData.merchantEmail);
  console.log('🏪 Test Store:', testData.storeName);
  console.log('─'.repeat(50));
  
  // اختبار التسجيل الجديد
  await testEasyRegister();
  
  // اختبار توكن موجود (إن وجد)
  await testExistingToken();
  
  console.log('\n🎉 انتهى الاختبار!');
  console.log('\nℹ️  للاختبار مع بيانات مختلفة:');
  console.log('   $env:BASE_URL="http://localhost:3000"; node tools/test-easy-mode.js');
}

// تشغيل الاختبار
main().catch(console.error);

