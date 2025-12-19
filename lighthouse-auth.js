// lighthouse-auth.js - Run Lighthouse on authenticated pages
const puppeteer = require('puppeteer');
const lighthouseModule = require('lighthouse');
const lighthouse = lighthouseModule.default || lighthouseModule;
const fs = require('fs');

const LOGIN_URL = 'http://localhost:3000/login';
const TARGET_URL = 'http://localhost:3000/admin/dashboard';
const EMAIL = 'reviews@theqah.com.sa';
const PASSWORD = 'ASWqer123';

async function run() {
  console.log('🚀 Starting authenticated Lighthouse test...');
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Step 1: Login
    console.log('📝 Logging in...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
    
    // Fill login form - using correct selectors
    await page.waitForSelector('#email');
    await page.type('#email', EMAIL);
    await page.type('#password', PASSWORD);
    
    // Click login button and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[type="submit"]')
    ]);
    
    console.log('✅ Logged in! Current URL:', page.url());
    
    // Step 2: Navigate to admin dashboard
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
    console.log('📊 On admin dashboard:', page.url());
    
    // Step 3: Get the port for Lighthouse
    const browserWSEndpoint = browser.wsEndpoint();
    const port = new URL(browserWSEndpoint).port;
    
    // Step 4: Run Lighthouse
    console.log('🔦 Running Lighthouse...');
    const result = await lighthouse(TARGET_URL, {
      port,
      output: ['json', 'html'],
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    
    // Save reports
    fs.writeFileSync('lighthouse-admin-auth.report.json', JSON.stringify(result.lhr, null, 2));
    fs.writeFileSync('lighthouse-admin-auth.report.html', result.report[1]);
    
    // Print summary
    const scores = {
      performance: Math.round(result.lhr.categories.performance.score * 100),
      accessibility: Math.round(result.lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(result.lhr.categories['best-practices'].score * 100),
      seo: Math.round(result.lhr.categories.seo.score * 100),
      fcp: result.lhr.audits['first-contentful-paint'].displayValue,
      lcp: result.lhr.audits['largest-contentful-paint'].displayValue,
      tbt: result.lhr.audits['total-blocking-time'].displayValue,
      cls: result.lhr.audits['cumulative-layout-shift'].displayValue,
    };
    
    console.log('\n📊 ═══════════════════════════════════════');
    console.log('   ADMIN DASHBOARD LIGHTHOUSE RESULTS');
    console.log('═══════════════════════════════════════\n');
    console.log(`   Performance:     ${scores.performance}%`);
    console.log(`   Accessibility:   ${scores.accessibility}%`);
    console.log(`   Best Practices:  ${scores.bestPractices}%`);
    console.log(`   SEO:             ${scores.seo}%`);
    console.log('\n   Core Web Vitals:');
    console.log(`   FCP: ${scores.fcp}`);
    console.log(`   LCP: ${scores.lcp}`);
    console.log(`   TBT: ${scores.tbt}`);
    console.log(`   CLS: ${scores.cls}`);
    console.log('\n═══════════════════════════════════════');
    console.log('✅ Reports saved: lighthouse-admin-auth.report.html');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

run();
