# Comprehensive Website Testing Prompt

## 🎯 Mission
Conduct a thorough, production-grade evaluation of TheQah platform (https://theqah.vercel.app) across all critical dimensions: functionality, performance, accessibility, security, SEO, and user experience.

---

## 📋 Testing Scope

### 1. Performance Testing
**Objective:** Validate speed, bundle sizes, and Core Web Vitals

**Tests to Run:**
- [ ] Run Lighthouse audit on homepage (/)
- [ ] Run Lighthouse audit on dashboard (/dashboard)
- [ ] Run Lighthouse audit on admin dashboard (/admin/dashboard)
- [ ] Test widget loading time (theqah-widget.js, theqah-stars.js)
- [ ] Measure API response times (/api/reviews/*, /api/dashboard/*)
- [ ] Check bundle sizes with Bundle Analyzer
- [ ] Verify Core Web Vitals:
  - FCP < 1.5s
  - LCP < 2.5s
  - TBT < 300ms
  - CLS < 0.1

**Commands:**
```bash
# Lighthouse audits
lighthouse https://theqah.vercel.app --output=html --output=json --output-path=./reports/homepage --view
lighthouse https://theqah.vercel.app/dashboard --output=html --output=json --output-path=./reports/dashboard --view

# Bundle analysis
ANALYZE=true npm run build

# API performance (use Chrome DevTools Network tab)
# Record: Average response time for 10 requests to each endpoint
```

**Success Criteria:**
- Performance Score: > 85
- All Core Web Vitals: GREEN
- API p95 response time: < 500ms
- Widget load time: < 1s

---

### 2. Functionality Testing
**Objective:** Verify all features work correctly end-to-end

#### Authentication Flow
- [ ] User registration with email/password
- [ ] User login with email/password
- [ ] Google OAuth login
- [ ] Password reset flow
- [ ] Session persistence across page reloads
- [ ] Logout functionality
- [ ] Protected route redirection (dashboard requires auth)

#### Dashboard Features (Merchant User)
- [ ] View reviews list with pagination
- [ ] Filter reviews by rating (1-5 stars)
- [ ] Search reviews by customer name/content
- [ ] View review details (images, text, rating, date)
- [ ] Reply to reviews
- [ ] Archive/delete reviews
- [ ] View analytics charts (sentiment distribution)
- [ ] View orders list with pagination
- [ ] Track review requests sent vs received
- [ ] Settings page (API keys, notifications)

#### Admin Dashboard
- [ ] View all merchants
- [ ] View system-wide analytics
- [ ] Monitor metrics (total reviews, active users)
- [ ] View subscription status
- [ ] Access monitoring dashboard

#### Widget Integration
- [ ] Widget loads on external site (iframe)
- [ ] Widget displays merchant's reviews
- [ ] Star rating widget shows correct average
- [ ] Widget is responsive (mobile, tablet, desktop)
- [ ] Widget handles missing/empty data gracefully

#### API Endpoints
Test each public endpoint:
- [ ] GET /api/public/reviews/:merchantId
- [ ] GET /api/public/stats/:merchantId
- [ ] GET /api/public/widget/:merchantId
- [ ] POST /api/reviews/submit (with valid shortlink)
- [ ] POST /api/salla/webhook (mock webhook)
- [ ] GET /api/dashboard/analytics
- [ ] GET /api/dashboard/reviews

**Commands:**
```bash
# Run E2E tests
npm run test:e2e

# Run API tests manually
curl https://theqah.vercel.app/api/public/stats/MERCHANT_ID
```

**Success Criteria:**
- All E2E tests pass
- No 500 errors in production logs
- All user flows complete without errors

---

### 3. Accessibility Testing
**Objective:** Ensure WCAG 2.1 AA compliance

**Tests to Run:**
- [ ] Run Lighthouse accessibility audit (target: 100)
- [ ] Test keyboard navigation (Tab, Enter, Esc)
- [ ] Test screen reader compatibility (NVDA/JAWS)
- [ ] Check color contrast ratios (text, buttons, links)
- [ ] Verify ARIA labels on interactive elements
- [ ] Test focus indicators (visible and high contrast)
- [ ] Check form labels and error messages
- [ ] Verify heading hierarchy (h1 → h2 → h3)
- [ ] Test with browser zoom (200%, 400%)
- [ ] Check for alt text on all images

**Tools:**
- Lighthouse (built-in accessibility audit)
- axe DevTools browser extension
- WAVE browser extension
- Keyboard-only navigation

**Success Criteria:**
- Lighthouse Accessibility: > 95
- Zero critical accessibility violations
- All interactive elements keyboard accessible
- Color contrast: AAA level (7:1 for text)

---

### 4. Security Testing
**Objective:** Identify vulnerabilities and ensure secure deployment

**Tests to Run:**
- [ ] Check HTTPS enforcement (no mixed content)
- [ ] Verify CSP headers (Content-Security-Policy)
- [ ] Test XSS protection (X-XSS-Protection header)
- [ ] Verify HSTS header (Strict-Transport-Security)
- [ ] Check X-Frame-Options (clickjacking protection)
- [ ] Test API authentication (protected routes require auth)
- [ ] Verify JWT token expiration
- [ ] Check for exposed secrets in client bundle
- [ ] Test rate limiting on API endpoints
- [ ] Verify Firebase security rules (Firestore, Storage)
- [ ] Check for SQL injection (if using SQL)
- [ ] Test CORS configuration
- [ ] Verify input sanitization (review text, user input)

**Tools:**
```bash
# Check security headers
curl -I https://theqah.vercel.app

# Scan for vulnerabilities
npm audit
npm audit fix

# Check for exposed secrets
git secrets --scan

# Test Firebase rules
firebase emulators:start --only firestore
# Run test against firestore.rules
```

**Success Criteria:**
- Lighthouse Best Practices: 100
- Zero high/critical npm vulnerabilities
- All security headers present
- Firebase rules tested and secure

---

### 5. SEO Testing
**Objective:** Optimize for search engine visibility

**Tests to Run:**
- [ ] Run Lighthouse SEO audit (target: 100)
- [ ] Verify meta tags (title, description, og:image)
- [ ] Check robots.txt accessibility
- [ ] Verify sitemap.xml exists and is valid
- [ ] Test canonical URLs
- [ ] Check structured data (JSON-LD schema)
- [ ] Verify hreflang tags (if multi-language)
- [ ] Test mobile-friendliness (Google Mobile-Friendly Test)
- [ ] Check page load speed (PageSpeed Insights)
- [ ] Verify Open Graph tags (social sharing)
- [ ] Test Twitter Card tags
- [ ] Check internal linking structure

**Tools:**
```bash
# Lighthouse SEO
lighthouse https://theqah.vercel.app --only-categories=seo --view

# Check meta tags
curl https://theqah.vercel.app | grep -i "<meta"
```

**Success Criteria:**
- Lighthouse SEO: 100
- All pages have unique titles and descriptions
- Structured data validates (Google Rich Results Test)
- Mobile-friendly score: 100

---

### 6. Browser Compatibility Testing
**Objective:** Ensure cross-browser functionality

**Browsers to Test:**
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS)

**Tests for Each Browser:**
- [ ] Homepage loads correctly
- [ ] Dashboard functionality works
- [ ] Authentication works
- [ ] Widget embeds correctly
- [ ] Charts render properly
- [ ] Forms submit successfully
- [ ] No console errors

**Success Criteria:**
- All features work in all browsers
- Zero critical console errors
- Consistent UI/UX across browsers

---

### 7. Responsive Design Testing
**Objective:** Verify mobile, tablet, and desktop layouts

**Viewports to Test:**
- [ ] Mobile (375x667 - iPhone SE)
- [ ] Mobile (390x844 - iPhone 12/13)
- [ ] Mobile (414x896 - iPhone 14 Pro Max)
- [ ] Tablet (768x1024 - iPad)
- [ ] Tablet (820x1180 - iPad Air)
- [ ] Desktop (1280x720 - Small laptop)
- [ ] Desktop (1920x1080 - Full HD)
- [ ] Desktop (2560x1440 - 2K)

**Tests for Each Viewport:**
- [ ] Layout doesn't break
- [ ] Text is readable (no tiny fonts)
- [ ] Buttons are tappable (min 44x44px)
- [ ] Navigation is accessible
- [ ] Forms are usable
- [ ] Images scale properly
- [ ] No horizontal scrolling

**Tools:**
- Chrome DevTools responsive mode
- BrowserStack (real devices)

**Success Criteria:**
- All viewports display correctly
- Touch targets: minimum 44x44px
- No layout shifts (CLS < 0.1)

---

### 8. Load Testing
**Objective:** Verify system handles concurrent users

**Tests to Run:**
- [ ] Redirect endpoint (/r/[id]) - 50 concurrent users
- [ ] Review submission (/api/reviews/submit) - 20 concurrent users
- [ ] Widget load (/api/public/reviews) - 100 concurrent users
- [ ] Dashboard API (/api/dashboard/*) - 30 concurrent users

**Commands:**
```bash
# Using k6 (already configured)
npm run load:k6              # Redirect test
npm run load:k6:reviews      # Review creation test
npm run load:k6:outbox       # Background job test
```

**Success Criteria:**
- p95 response time: < 500ms (redirects)
- p95 response time: < 2000ms (review creation)
- Zero 500 errors
- System remains stable under load

---

### 9. Error Handling Testing
**Objective:** Verify graceful error handling

**Scenarios to Test:**
- [ ] Network offline (test offline mode)
- [ ] API returns 500 error
- [ ] Invalid authentication token
- [ ] Rate limit exceeded (429)
- [ ] Invalid form input
- [ ] File upload failure
- [ ] Database connection failure
- [ ] Third-party service down (Salla webhook)
- [ ] Missing environment variables
- [ ] Invalid shortlink ID

**Success Criteria:**
- User sees helpful error messages
- No white screen of death
- Errors logged to monitoring
- App recovers gracefully

---

### 10. Data Integrity Testing
**Objective:** Verify data accuracy and consistency

**Tests to Run:**
- [ ] Review creation: data saved correctly in Firestore
- [ ] Review update: changes persisted
- [ ] Review deletion: soft delete (archived)
- [ ] Analytics calculation: correct aggregation
- [ ] Pagination: no duplicate/missing items
- [ ] Webhook processing: orders synced correctly
- [ ] Background jobs: outbox pattern works
- [ ] Cache invalidation: stale data cleared

**Success Criteria:**
- Zero data loss
- Correct calculations (ratings, counts)
- Consistent data across dashboard and API

---

## 🚀 Complete Testing Workflow

### Quick Test (30 minutes)
```bash
# 1. Performance
lighthouse https://theqah.vercel.app --view

# 2. Bundle
ANALYZE=true npm run build

# 3. E2E
npm run test:e2e

# 4. Security
npm audit
```

### Full Test (2-3 hours)
```bash
# 1. Clean build
npm run build

# 2. Performance tests
lighthouse https://theqah.vercel.app --output=html --output-path=./reports/home --view
lighthouse https://theqah.vercel.app/dashboard --output=html --output-path=./reports/dash --view
ANALYZE=true npm run build

# 3. E2E tests
npm run test:e2e

# 4. Load tests
npm run load:k6
npm run load:k6:reviews

# 5. Security audit
npm audit
npm audit fix

# 6. Manual tests (checklist above)
# - Test all user flows
# - Test across browsers
# - Test responsive design
# - Test accessibility (keyboard nav, screen reader)
```

---

## 📊 Test Report Template

### Summary
- **Date:** [DATE]
- **Tester:** [NAME]
- **Duration:** [TIME]
- **Environment:** Production (https://theqah.vercel.app)

### Results Overview
| Category | Score | Status | Notes |
|----------|-------|--------|-------|
| Performance | X/100 | ✅/⚠️/🔴 | |
| Accessibility | X/100 | ✅/⚠️/🔴 | |
| Best Practices | X/100 | ✅/⚠️/🔴 | |
| SEO | X/100 | ✅/⚠️/🔴 | |
| Functionality | Pass/Fail | ✅/🔴 | |
| Security | Pass/Fail | ✅/🔴 | |
| Load Testing | Pass/Fail | ✅/🔴 | |

### Critical Issues Found
1. [Issue description]
   - **Severity:** High/Medium/Low
   - **Impact:** [User impact]
   - **Steps to reproduce:** [Steps]
   - **Recommendation:** [Fix]

### Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
3. [Recommendation 3]

---

## 🎯 Use This Prompt With:

### AI Assistants (Claude, GPT-4, etc.)
Copy this prompt:
```
I need you to act as a senior QA engineer and conduct comprehensive testing of the TheQah platform (https://theqah.vercel.app).

Follow the testing plan in COMPREHENSIVE_TESTING_PROMPT.md and:
1. Run all automated tests (Lighthouse, Bundle Analyzer, E2E)
2. Document findings with screenshots
3. Prioritize issues by severity
4. Provide actionable recommendations
5. Create a test report

Focus on: Performance, Security, Accessibility, and User Experience.
```

### Manual Testing
Use this document as a checklist and test each item systematically.

### Automated Testing Pipeline
Integrate these tests into CI/CD:
```yaml
# .github/workflows/test.yml
name: Comprehensive Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - run: npm run test:e2e
      - run: npm audit
      - run: lighthouse https://theqah.vercel.app --output=json
```

---

**Last Updated:** December 17, 2025  
**Version:** 1.0  
**Status:** Ready for use 🚀
