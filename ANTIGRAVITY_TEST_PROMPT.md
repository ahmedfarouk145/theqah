# Antigravity Testing & Performance Validation Prompt

## 🎯 Project Overview

**Project Name:** TheQah - Verified Reviews Platform for Salla Merchants  
**Current Status:** M5 Complete (307/307 tests passing)  
**Mission:** Test, validate, and ensure production-readiness of the Salla reviews integration system

---

## 📋 Testing Objectives

### Primary Goals
1. **Functional Testing**: Verify all Salla webhook integrations work correctly
2. **Performance Testing**: Ensure system handles real-world load efficiently
3. **Security Testing**: Validate authentication, rate limiting, and data protection
4. **Integration Testing**: Confirm end-to-end flows from Salla → TheQah → Customer
5. **Error Handling**: Test resilience under failure scenarios

---

## 🔧 Salla Integration Logic Overview

### Core Components

#### 1. **Webhook Handler** (`/api/salla/webhook`)
```typescript
Purpose: Receive order events from Salla
Flow:
  1. Validate HMAC signature (crypto.createHmac with store secret)
  2. Extract order data (customer mobile, order ID, store UID)
  3. Normalize Saudi mobile numbers (966XXXXXXXXX format)
  4. Queue review request for processing
  5. Return 200 OK immediately (async processing)

Security:
  - HMAC-SHA256 signature verification
  - Webhook-specific rate limiting (300 req/min per store)
  - IP validation (optional)
  - Replay attack prevention (timestamp validation)
```

#### 2. **OAuth Flow** (`/api/salla/oauth`)
```typescript
Purpose: Merchant authentication and store connection
Flow:
  1. Receive authorization code from Salla
  2. Exchange code for access token + refresh token
  3. Fetch store info (name, logo, domain)
  4. Store credentials in Firestore (encrypted)
  5. Create initial store configuration
  6. Redirect to merchant dashboard

Token Management:
  - Access token: 2 hours TTL
  - Refresh token: 30 days TTL
  - Auto-refresh on API calls
  - Secure storage in Firestore with encryption
```

#### 3. **Review Sync** (`/api/cron/sync-salla-reviews`)
```typescript
Purpose: Periodic sync of reviews from Salla stores
Flow:
  1. Fetch all active stores from Firestore
  2. For each store:
     - Get Salla access token (refresh if expired)
     - Fetch recent orders (since last sync)
     - Filter orders eligible for reviews
     - Queue review requests
     - Update sync metadata
  3. Handle rate limits (100 req/min per store)
  4. Retry failed requests (exponential backoff)
  5. Log metrics and errors

Scheduling:
  - Primary: Vercel Cron (8 AM, 2 PM, 8 PM UTC)
  - Backup: GitHub Actions (3 AM UTC daily)
  - Manual: Admin API endpoint
```

#### 4. **Review Request Processing**
```typescript
Purpose: Send review requests to customers
Flow:
  1. Validate customer mobile number
  2. Check if review already sent for this order
  3. Generate unique review link (shortlink)
  4. Send WhatsApp message via provider
  5. Track delivery status
  6. Handle failures (retry queue + DLQ)

Business Rules:
  - One review per order
  - Send 3-7 days after order completion
  - Customer can opt-out (privacy)
  - Support Arabic & English
```

---

## 🧪 Test Scenarios & Acceptance Criteria

### 1. Webhook Processing Tests

#### Scenario 1.1: Valid Order Webhook
```yaml
Given: Salla sends order.updated webhook
  - Valid HMAC signature
  - Complete order data
  - Saudi mobile number in various formats

When: Webhook is processed

Then:
  ✅ Returns 200 OK within 500ms
  ✅ Mobile normalized to 966XXXXXXXXX format
  ✅ Order stored in Firestore with correct structure
  ✅ Review request queued for processing
  ✅ Webhook logged with success status
  ✅ Store metrics updated (total orders, pending reviews)

Performance:
  - Response time: < 500ms (p95)
  - Throughput: 100 webhooks/second per store
  - Memory usage: < 128MB per request
```

#### Scenario 1.2: Invalid Signature
```yaml
Given: Webhook with tampered/invalid signature

When: Webhook is processed

Then:
  ✅ Returns 401 Unauthorized within 100ms
  ✅ No data persisted to Firestore
  ✅ Security event logged
  ✅ Alert triggered (if > 5 failed attempts/min)
  ✅ IP temporarily blocked (after 10 failures)
```

#### Scenario 1.3: Duplicate Order
```yaml
Given: 
  - Order already processed
  - Same order_id sent again

When: Webhook received

Then:
  ✅ Returns 200 OK (idempotent)
  ✅ No duplicate review request created
  ✅ Updates existing order status only
  ✅ Logs duplicate detection
```

#### Scenario 1.4: Rate Limit Exceeded
```yaml
Given: Store exceeds 300 webhooks/minute

When: Additional webhook received

Then:
  ✅ Returns 429 Too Many Requests
  ✅ Retry-After header included (60 seconds)
  ✅ Rate limit counter persisted
  ✅ Resets after 1 minute window
```

---

### 2. OAuth Flow Tests

#### Scenario 2.1: New Merchant Connection
```yaml
Given: Merchant clicks "Connect Salla Store"

When: OAuth flow completes

Then:
  ✅ Authorization URL generated with correct params
  ✅ State parameter validates CSRF protection
  ✅ Access token + refresh token stored securely
  ✅ Store info fetched and saved (name, logo, domain)
  ✅ Default configuration created
  ✅ Merchant redirected to dashboard
  ✅ Welcome email sent

Performance:
  - Total flow time: < 3 seconds
  - Token exchange: < 500ms
```

#### Scenario 2.2: Token Refresh
```yaml
Given: 
  - Access token expired (> 2 hours)
  - Refresh token still valid

When: API call requires authentication

Then:
  ✅ Automatically refreshes access token
  ✅ New token stored in Firestore
  ✅ Original API call succeeds
  ✅ No error shown to merchant
  ✅ Refresh logged for monitoring

Performance:
  - Token refresh: < 300ms
  - Transparent to user
```

#### Scenario 2.3: Disconnected Store
```yaml
Given: Merchant revokes access in Salla

When: System tries to fetch store data

Then:
  ✅ Detects 401/403 error
  ✅ Marks store as disconnected
  ✅ Notifies merchant (email + dashboard alert)
  ✅ Pauses review requests
  ✅ Preserves historical data
```

---

### 3. Review Sync Tests

#### Scenario 3.1: Daily Full Sync
```yaml
Given: 
  - 50 active stores
  - Each has 10 new orders

When: Cron job runs at 8 AM UTC

Then:
  ✅ Completes within 5 minutes
  ✅ All 500 orders processed
  ✅ Review requests queued correctly
  ✅ Sync metadata updated (lastSyncAt, ordersCount)
  ✅ No rate limit violations
  ✅ Error rate < 1%
  ✅ Metrics logged to monitoring

Performance:
  - Total time: < 5 minutes
  - Orders/second: > 1.6
  - Memory: < 512MB
  - API calls: Batch optimized
```

#### Scenario 3.2: Incremental Sync
```yaml
Given: 
  - Last sync was 4 hours ago
  - Only 5 new orders since then

When: Incremental sync runs

Then:
  ✅ Fetches only orders since lastSyncAt
  ✅ Processes 5 orders efficiently
  ✅ Completes within 10 seconds
  ✅ No unnecessary API calls
  ✅ Cursor-based pagination used
```

#### Scenario 3.3: Sync with Failures
```yaml
Given:
  - 10 stores to sync
  - 2 stores have expired tokens
  - 1 store has network timeout

When: Sync runs

Then:
  ✅ Successfully syncs 7 stores
  ✅ Retries failed stores (3 attempts)
  ✅ Logs errors with context
  ✅ Continues with remaining stores
  ✅ Final report shows 7/10 success
  ✅ Failed stores queued for retry
```

---

### 4. Performance & Load Tests

#### Scenario 4.1: High Traffic Webhook Burst
```yaml
Given: Black Friday sale
  - 100 stores
  - 1000 orders/minute total

When: Webhooks flood the system

Then:
  ✅ All webhooks accepted (200 OK)
  ✅ No request dropped
  ✅ P95 latency < 1 second
  ✅ P99 latency < 2 seconds
  ✅ Memory stable (no leaks)
  ✅ Firestore write rate within limits (10,000/sec)
  ✅ Rate limiting per store enforced

Load Test Duration: 10 minutes
Success Criteria:
  - 0% error rate
  - Average response time < 500ms
  - CPU < 80%
  - Memory < 70%
```

#### Scenario 4.2: Database Query Performance
```yaml
Given: 
  - 100,000 orders in Firestore
  - 5,000 stores
  - 50,000 reviews

When: Dashboard queries data

Then:
  ✅ Store analytics load < 500ms
  ✅ Review list pagination < 300ms
  ✅ Search by order ID < 200ms
  ✅ Composite indexes used efficiently
  ✅ No full collection scans

Performance Targets:
  - Query time: < 500ms (p95)
  - Index usage: 100%
  - Firestore reads: < 1000/query
```

#### Scenario 4.3: Concurrent Sync Jobs
```yaml
Given:
  - 3 cron triggers fire simultaneously
  - 100 stores to sync

When: Jobs run concurrently

Then:
  ✅ No race conditions
  ✅ Distributed locking prevents duplicates
  ✅ Each job processes unique stores
  ✅ Firestore transactions succeed
  ✅ No data corruption
  ✅ All jobs complete within 10 minutes
```

---

### 5. Error Handling & Resilience Tests

#### Scenario 5.1: Firestore Timeout
```yaml
Given: Firestore experiences latency

When: Writing order data

Then:
  ✅ Request retried (3 attempts)
  ✅ Exponential backoff (1s, 2s, 4s)
  ✅ Falls back to queue if all fail
  ✅ User sees 503 Service Unavailable
  ✅ Error logged with trace ID
  ✅ Alert sent to monitoring

Recovery:
  - Automatic retry from queue
  - Data eventually consistent
  - No data loss
```

#### Scenario 5.2: Salla API Downtime
```yaml
Given: Salla API returns 500/503

When: Sync job runs

Then:
  ✅ Detects API failure
  ✅ Skips affected stores temporarily
  ✅ Continues with available stores
  ✅ Schedules retry in 30 minutes
  ✅ Dashboard shows "Sync delayed"
  ✅ No infinite retry loops

Recovery:
  - Automatic retry when API recovers
  - Backlog processed
  - Merchants notified when resolved
```

#### Scenario 5.3: Memory Leak Detection
```yaml
Given: System runs for 7 days

When: Monitoring memory usage

Then:
  ✅ Memory stays stable (< 512MB)
  ✅ No unbounded growth
  ✅ Garbage collection effective
  ✅ No zombie processes
  ✅ Connection pools bounded
  ✅ Event listeners cleaned up

Monitoring:
  - Memory snapshots every hour
  - Heap dumps on threshold breach
  - Automatic restart if > 1GB
```

---

### 6. Security & Compliance Tests

#### Scenario 6.1: SQL Injection Prevention
```yaml
Given: Attacker sends malicious input

When: Input processed

Then:
  ✅ Parameterized queries used
  ✅ Input sanitized/validated
  ✅ No database access with raw input
  ✅ Attack logged
  ✅ IP blocked after 3 attempts
```

#### Scenario 6.2: GDPR Compliance
```yaml
Given: Customer requests data deletion

When: Delete request processed

Then:
  ✅ All customer data removed from Firestore
  ✅ Review data anonymized (mobile removed)
  ✅ Logs purged after 90 days
  ✅ Confirmation sent to customer
  ✅ Audit trail maintained (what/when/who)

Data Retention:
  - Customer data: Until deletion request
  - Logs: 90 days
  - Analytics: Aggregated only
```

#### Scenario 6.3: Rate Limit Bypass Attempt
```yaml
Given: Attacker rotates IPs to bypass rate limits

When: Suspicious pattern detected

Then:
  ✅ Per-store rate limit still enforced
  ✅ Token-based limits apply
  ✅ Suspicious activity flagged
  ✅ Automatic temporary block
  ✅ Admin alert triggered
```

---

## 📊 Performance Benchmarks

### API Response Times (Target)
```yaml
Endpoint                          P50      P95      P99      Max
------------------------------------------------------------------
POST /api/salla/webhook          50ms    300ms    800ms    2s
GET  /api/salla/oauth            100ms   400ms    1s       3s
POST /api/cron/sync              2s      4s       8s       5min
GET  /api/reviews/[id]           30ms    150ms    400ms    1s
POST /api/reviews/create         80ms    350ms    900ms    2s
GET  /api/admin/dashboard        100ms   500ms    1.5s     3s
```

### Database Performance (Target)
```yaml
Operation                        Target   Alert    Critical
------------------------------------------------------------------
Firestore Write (single)         < 50ms   > 200ms  > 500ms
Firestore Read (single)          < 30ms   > 150ms  > 300ms
Firestore Query (paginated)      < 100ms  > 500ms  > 1s
Batch Write (100 docs)           < 500ms  > 2s     > 5s
Transaction (3 operations)       < 200ms  > 1s     > 2s
```

### System Resources (Target)
```yaml
Metric                           Normal   Warning  Critical
------------------------------------------------------------------
Memory Usage                     < 256MB  > 512MB  > 768MB
CPU Usage                        < 40%    > 70%    > 90%
Network I/O                      < 10MB/s > 50MB/s > 100MB/s
Firestore Reads/min              < 10K    > 50K    > 100K
Firestore Writes/min             < 5K     > 20K    > 40K
```

---

## 🧪 Testing Tools & Commands

### Unit & Integration Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npx vitest src/__tests__/api/webhook.test.ts

# Watch mode
npm test -- --watch
```

### Performance Testing
```bash
# Load test with k6
npm run load:k6:reviews

# Webhook stress test
k6 run tools/loadtest/k6/webhook-stress-test.js

# Database query performance
npm run test:db-performance
```

### End-to-End Testing
```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Specific test
npx playwright test tests/e2e/salla-integration.spec.ts
```

### Manual Testing
```bash
# Test webhook locally
npm run test:webhook

# Test OAuth flow
npm run test:oauth

# Test sync job
npm run test:review
```

---

## 🎯 Acceptance Criteria Summary

### Critical (Must Pass)
- [ ] All 307 unit/integration tests pass (100%)
- [ ] Webhook signature validation works 100% correctly
- [ ] No data loss under any scenario
- [ ] OAuth flow completes within 3 seconds
- [ ] Rate limiting enforces limits strictly
- [ ] No security vulnerabilities (OWASP Top 10)
- [ ] GDPR compliance verified
- [ ] Error rate < 0.1% in production

### High Priority (Should Pass)
- [ ] P95 response time < 500ms for all APIs
- [ ] Handles 100 concurrent webhooks without errors
- [ ] Sync completes within 5 minutes for 50 stores
- [ ] Memory stable over 7 days (no leaks)
- [ ] Automatic recovery from Firestore/Salla outages
- [ ] Monitoring alerts work correctly
- [ ] Logs provide adequate debugging info

### Medium Priority (Nice to Have)
- [ ] P99 response time < 1 second
- [ ] Handles 1000 webhooks/minute burst
- [ ] Dashboard loads in < 500ms
- [ ] Support 1000+ concurrent stores
- [ ] Advanced analytics queries < 1 second
- [ ] Multi-region deployment ready

---

## 🔍 Testing Checklist for Antigravity

### Pre-Testing Setup
- [ ] Clone repository and install dependencies
- [ ] Set up Firebase project (test environment)
- [ ] Configure environment variables (.env.local)
- [ ] Initialize test data (seed scripts)
- [ ] Verify all services accessible

### Functional Testing
- [ ] Test all webhook event types
- [ ] Test OAuth flow (success + error cases)
- [ ] Test review sync (full + incremental)
- [ ] Test review request sending
- [ ] Test customer review submission
- [ ] Test merchant dashboard features
- [ ] Test admin monitoring tools

### Performance Testing
- [ ] Run load tests for webhooks (k6)
- [ ] Profile database queries (Firestore console)
- [ ] Monitor memory usage (Node.js profiler)
- [ ] Test concurrent operations
- [ ] Measure API response times
- [ ] Test with realistic data volumes

### Security Testing
- [ ] Verify HMAC signature validation
- [ ] Test rate limiting enforcement
- [ ] Attempt SQL injection attacks
- [ ] Test CORS policies
- [ ] Verify secrets encryption
- [ ] Test authentication bypass attempts
- [ ] Validate input sanitization

### Error Handling Testing
- [ ] Test database timeouts
- [ ] Test API failures (Salla)
- [ ] Test network interruptions
- [ ] Test invalid input data
- [ ] Test missing required fields
- [ ] Test edge cases (empty, null, large data)

### Integration Testing
- [ ] Test end-to-end flow: Order → Review Request → Submission
- [ ] Test with real Salla test store
- [ ] Test cron job triggers
- [ ] Test webhook retry logic
- [ ] Test monitoring/alerting

### Post-Testing
- [ ] Document all bugs found
- [ ] Provide performance metrics report
- [ ] Suggest optimizations
- [ ] Verify all acceptance criteria met
- [ ] Create test coverage report

---

## 📝 Test Execution Report Template

```markdown
# Test Execution Report

## Summary
- **Date:** [Date]
- **Tester:** Antigravity
- **Environment:** [Test/Staging/Production]
- **Build Version:** [Git commit hash]

## Test Results
- **Total Tests:** [Number]
- **Passed:** [Number] (XX%)
- **Failed:** [Number] (XX%)
- **Skipped:** [Number] (XX%)

## Performance Metrics
- **Average Response Time:** XXXms
- **P95 Response Time:** XXXms
- **P99 Response Time:** XXXms
- **Throughput:** XXX req/sec
- **Error Rate:** X.XX%

## Critical Issues
1. [Issue description] - Priority: High
2. [Issue description] - Priority: Medium

## Recommendations
1. [Optimization suggestion]
2. [Security improvement]
3. [Performance enhancement]

## Acceptance Criteria Status
✅ Passed: [X/Y]
❌ Failed: [X/Y]
⚠️ Needs Review: [X/Y]

## Conclusion
[Overall assessment and readiness for production]
```

---

## 🚀 Production Readiness Checklist

### Code Quality
- [ ] 100% test coverage for critical paths
- [ ] No TypeScript errors
- [ ] No ESLint errors (only warnings allowed)
- [ ] Code reviewed and approved
- [ ] Documentation complete and accurate

### Performance
- [ ] Load testing passed (1000 webhooks/min)
- [ ] Database queries optimized
- [ ] No memory leaks detected
- [ ] Response times within targets
- [ ] Caching strategies implemented

### Security
- [ ] Security audit completed
- [ ] Secrets encrypted
- [ ] Rate limiting tested
- [ ] OWASP Top 10 verified
- [ ] GDPR compliance confirmed

### Monitoring
- [ ] Logging configured
- [ ] Error tracking setup (Sentry/similar)
- [ ] Performance monitoring active
- [ ] Alerts configured
- [ ] Dashboard accessible

### Infrastructure
- [ ] Database backups automated
- [ ] Disaster recovery plan documented
- [ ] Scaling strategy defined
- [ ] CI/CD pipeline working
- [ ] Rollback procedure tested

### Business
- [ ] Merchant onboarding tested
- [ ] Customer journey verified
- [ ] Support documentation ready
- [ ] Billing/pricing confirmed
- [ ] Legal compliance verified

---

## 📞 Support & Resources

### Documentation
- **API Docs:** `/docs/api/README.md`
- **Architecture:** `/ARCHITECTURE.md`
- **Salla Integration:** `/SALLA_REVIEWS_INTEGRATION.md`
- **Deployment:** `/DEPLOYMENT_COMPARISON.md`

### Test Tools
- **Unit Tests:** Vitest (`npm test`)
- **E2E Tests:** Playwright (`npm run test:e2e`)
- **Load Tests:** k6 (`npm run load:k6`)
- **Manual Tests:** Tools in `/tools/` directory

### Monitoring
- **Logs:** Vercel Dashboard / Firebase Console
- **Metrics:** `/api/admin/monitor-sync`
- **Health Check:** `/api/health`

---

**Last Updated:** December 18, 2025  
**Version:** 1.0  
**Status:** Ready for Testing 🚀
