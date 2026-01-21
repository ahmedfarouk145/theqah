/**
 * Service layer barrel export
 * @module server/services
 */

// Core services
export { ReviewService } from './review.service';
export type { SubmitReviewInput, SubmitReviewResult } from './review.service';

export { StoreService } from './store.service';

export { OrderService } from './order.service';

export { VerificationService } from './verification.service';
export type { VerifiedReviewResult, StoreResolveResult } from './verification.service';

// Integration services
export { SallaWebhookService } from './salla-webhook.service';
export type { SallaOrder, SallaReviewPayload } from './salla-webhook.service';

export { SallaTokenService, sallaTokenService } from './salla-token.service';
export type { TokenRefreshResult } from './salla-token.service';

// Platform services
export { AdminService } from './admin.service';
export type { PlatformStats } from './admin.service';

export { MonitoringService } from './monitoring.service';
export type { HealthCheck, SystemHealth, SyncStats } from './monitoring.service';

export { NotificationService } from './notification.service';
export type { NotificationOptions } from './notification.service';

export { SupportService } from './support.service';

export { AnalyticsService } from './analytics.service';
export type { ReviewAnalytics, StoreAnalytics } from './analytics.service';
