// tools/loadtest/k6/redirect-test.js
/**
 * k6 Load Test for Short Link Redirect Endpoint
 * 
 * Usage:
 *   k6 run tools/loadtest/k6/redirect-test.js
 * 
 * Options:
 *   -e BASE_URL=http://localhost:3000
 *   -e SHORTLINK_CODE=abc12345
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests should be below 500ms
    'errors': ['rate<0.1'],              // Error rate should be less than 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SHORTLINK_CODE = __ENV.SHORTLINK_CODE || 'test1234';

export default function() {
  const url = `${BASE_URL}/r/${SHORTLINK_CODE}`;
  
  const params = {
    redirects: 0, // Don't follow redirects automatically
    tags: { name: 'ShortLinkRedirect' },
  };

  const response = http.get(url, params);

  // Check if the response is a redirect (302)
  const success = check(response, {
    'is status 302 or 404': (r) => r.status === 302 || r.status === 404,
    'has location header (if 302)': (r) => r.status !== 302 || r.headers['Location'] !== undefined,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!success);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const { indent = '', enableColors = false } = opts || {};
  
  return `
${indent}✓ Checks passed: ${data.metrics.checks.passes}/${data.metrics.checks.passes + data.metrics.checks.fails}
${indent}✓ Requests made: ${data.metrics.http_reqs.values.count}
${indent}✓ Error rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%
${indent}✓ Avg response time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms
${indent}✓ p95 response time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
`;
}
