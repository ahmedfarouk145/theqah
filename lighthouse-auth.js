// lighthouse-auth.js - Run Lighthouse on authenticated pages
// NOTE: Credentials should be passed via environment variables for security
const puppeteer = require('puppeteer');
const lighthouseModule = require('lighthouse');
const lighthouse = lighthouseModule.default || lighthouseModule;
const fs = require('fs');

// Get credentials from environment variables or command line args
const BASE_URL = process.env.LH_BASE_URL || 'https://www.theqah.com.sa';
const EMAIL = process.env.LH_EMAIL || process.argv[2];
const PASSWORD = process.env.LH_PASSWORD || process.argv[3];
const TARGET_PATH = process.env.LH_TARGET || process.argv[4] || '/dashboard';

if (!EMAIL || !PASSWORD) {
  console.log('Usage: node lighthouse-auth.js <email> <password> [target_path]');
  console.log('Or set environment variables: LH_EMAIL, LH_PASSWORD, LH_TARGET');
  process.exit(1);
}

const LOGIN_URL = `${BASE_URL}/login`;
const TARGET_URL = `${BASE_URL}${TARGET_PATH}`;

async function run() {
  console.log('🚀 Starting authenticated Lighthouse test...');
  console.log(`📍 Target: ${TARGET_URL}`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('📝 Logging in...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
    
    await page.waitForSelector('#email');
    await page.type('#email', EMAIL);
    await page.type('#password', PASSWORD);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[type="submit"]')
    ]);
    
    console.log('✅ Logged in! Current URL:', page.url());
    
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
    console.log('📊 On target page:', page.url());
    
    const browserWSEndpoint = browser.wsEndpoint();
    const port = new URL(browserWSEndpoint).port;
    
    console.log('🔦 Running Lighthouse...');
    const result = await lighthouse(TARGET_URL, {
      port,
      output: ['json', 'html'],
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    
    const safePath = TARGET_PATH.replace(/\//g, '-').replace(/^-/, '');
    fs.writeFileSync(`lighthouse-${safePath}.report.json`, JSON.stringify(result.lhr, null, 2));
    fs.writeFileSync(`lighthouse-${safePath}.report.html`, result.report[1]);
    
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
    console.log(`   LIGHTHOUSE RESULTS: ${TARGET_PATH}`);
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
    console.log(`✅ Reports saved: lighthouse-${safePath}.report.html`);
    
    return scores;
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

run();
