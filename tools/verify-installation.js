#!/usr/bin/env node
/**
 * Installation Verification Script
 * 
 * Checks if all new features are properly installed
 */

const fs = require('fs');
const path = require('path');

// Get project root directory
const projectRoot = path.resolve(__dirname, '..');

console.log('\n🔍 Verifying Feature Installation...\n');
console.log(`📂 Project root: ${projectRoot}\n`);

let allGood = true;

// Check if files exist
const requiredFiles = [
  'src/server/triggers/review-created.ts',
  'src/pages/api/reviews/update-status.ts',
  'src/pages/api/reviews/index.ts',
  'src/features/flags/useFlag.ts',
  'src/features/reviews/PendingReviewsTab.tsx',
  'tools/loadtest/k6/redirect-test.js',
  'tools/loadtest/k6/review-create-test.js',
  'tools/loadtest/k6/outbox-jobs-test.js',
  'tests/e2e/review-approval.spec.ts',
  'tests/e2e/shortlink-redirect.spec.ts',
  'playwright.config.ts',
  'FEATURE_IMPLEMENTATION.md',
  'QUICK_START.md',
];

console.log('📁 Checking Required Files...');
requiredFiles.forEach(file => {
  const fullPath = path.join(projectRoot, file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allGood = false;
  }
});

// Check package.json scripts
console.log('\n📦 Checking npm Scripts...');
const packageJson = require(path.join(projectRoot, 'package.json'));
const requiredScripts = [
  'test:e2e',
  'test:e2e:ui',
  'load:k6',
  'load:k6:reviews',
  'load:k6:outbox',
];

requiredScripts.forEach(script => {
  if (packageJson.scripts[script]) {
    console.log(`  ✅ npm run ${script}`);
  } else {
    console.log(`  ❌ npm run ${script} - MISSING`);
    allGood = false;
  }
});

// Check dependencies
console.log('\n📚 Checking Dependencies...');
const requiredDeps = [
  { name: '@playwright/test', type: 'devDependencies' },
  { name: 'k6', type: 'devDependencies' },
];

requiredDeps.forEach(dep => {
  const deps = packageJson[dep.type] || {};
  if (deps[dep.name]) {
    console.log(`  ✅ ${dep.name} (${deps[dep.name]})`);
  } else {
    console.log(`  ❌ ${dep.name} - MISSING`);
    allGood = false;
  }
});

// Check Firestore rules
console.log('\n🔒 Checking Firestore Rules...');
const rulesFile = path.join(projectRoot, 'firestore.rules');
if (fs.existsSync(rulesFile)) {
  const rules = fs.readFileSync(rulesFile, 'utf-8');
  const rulesChecks = [
    { pattern: /outbox_jobs/, name: 'outbox_jobs rules' },
    { pattern: /outbox_dlq/, name: 'outbox_dlq rules' },
    { pattern: /status.*==.*"approved"/, name: 'review status filtering' },
  ];

  rulesChecks.forEach(check => {
    if (check.pattern.test(rules)) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ⚠️  ${check.name} - Not found (may be OK)`);
    }
  });
} else {
  console.log('  ❌ firestore.rules - MISSING');
  allGood = false;
}

// Summary
console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('✅ All checks passed! Installation complete.');
  console.log('\n📖 Next Steps:');
  console.log('   1. Read QUICK_START.md for testing instructions');
  console.log('   2. Read FEATURE_IMPLEMENTATION.md for full documentation');
  console.log('   3. Run "npm run lint" to verify code quality');
  console.log('   4. Run "npm run build" to ensure build works');
  console.log('   5. Enable feature flags when ready');
  process.exit(0);
} else {
  console.log('❌ Some checks failed. Please review the output above.');
  console.log('\n🔧 Possible Solutions:');
  console.log('   - Run "npm install" to install dependencies');
  console.log('   - Check if files were properly created');
  console.log('   - Review the git commit history');
  process.exit(1);
}
