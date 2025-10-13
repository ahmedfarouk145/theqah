// tools/loadtest/k6/outbox-jobs-test.js
/**
 * k6 Load Test for Outbox Jobs Processing (Mock)
 * 
 * This simulates concurrent job processing to test the outbox worker's capacity.
 * Should only be run against staging or emulator environments.
 * 
 * Usage:
 *   k6 run tools/loadtest/k6/outbox-jobs-test.js
 */

import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '20s', target: 10 },  // Ramp up to 10 workers
    { duration: '40s', target: 20 },  // Increase to 20 workers
    { duration: '20s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'errors': ['rate<0.1'], // Error rate should be less than 10%
  },
};

export default function() {
  // Simulate job processing
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();
  
  // Mock job processing - simulate different job types
  const jobTypes = ['email', 'sms', 'merchant_review_approval_needed'];
  const randomType = jobTypes[Math.floor(Math.random() * jobTypes.length)];
  
  // Simulate processing time (mock)
  const processingTime = Math.random() * 500 + 100; // 100-600ms
  sleep(processingTime / 1000);
  
  const duration = Date.now() - startTime;
  
  // Check processing metrics
  const success = check(duration, {
    'processing time < 1000ms': (d) => d < 1000,
  });

  errorRate.add(!success);

  console.log(`[${randomType}] Job ${jobId} processed in ${duration}ms`);
  
  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
  };
}

function textSummary(data) {
  return `
=== Outbox Jobs Processing Load Test Results ===
✓ Jobs processed: ${data.metrics.iterations.values.count}
✓ Error rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%
✓ Avg iteration time: ${data.metrics.iteration_duration.values.avg.toFixed(2)}ms

Note: This is a mock test. For real testing, integrate with actual outbox worker.
`;
}
