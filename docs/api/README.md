# TheQah API Documentation

Complete API reference for TheQah review management system.

## Base URL

```
Production: https://theqah.com/api
Development: http://localhost:3000/api
```

## Authentication

TheQah uses OAuth 2.0 for Salla integration and session-based authentication for dashboard access.

### Session Authentication
Required for: Dashboard, Admin endpoints

```http
Cookie: next-auth.session-token=<token>
```

### Salla OAuth
Required for: Store-specific operations

```http
Authorization: Bearer <salla_access_token>
```

## API Categories

### 1. [Authentication](./authentication.md)
OAuth flows, session management, and user authentication.

- `POST /api/auth/exchange-onboarding` - Exchange onboarding code
- `POST /api/auth/session` - Get current session
- `POST /api/auth/setup-password` - Set up password
- `POST /api/auth/verify-setup-token` - Verify setup token

### 2. [Reviews](./reviews.md)
Review management, moderation, and export.

- `GET /api/reviews` - List reviews
- `POST /api/reviews/submit` - Submit new review
- `PATCH /api/reviews/moderate` - Moderate review
- `POST /api/reviews/check-verified` - Check verification status
- `GET /api/reviews/export-csv` - Export as CSV
- `GET /api/reviews/export-pdf` - Export as PDF
- `PATCH /api/reviews/update-status` - Update review status

### 3. [Salla Integration](./salla.md)
Salla platform integration, webhook processing, and sync.

- `GET /api/salla/callback` - OAuth callback
- `POST /api/salla/connect` - Connect store
- `POST /api/salla/disconnect` - Disconnect store
- `POST /api/salla/refresh` - Refresh token
- `GET /api/salla/status` - Connection status
- `POST /api/salla/subscribe` - Subscribe to webhooks
- `POST /api/salla/sync-domains` - Sync domains
- `POST /api/salla/sync-reviews` - Manual review sync
- `POST /api/salla/verify` - Verify integration
- `POST /api/salla/webhook` - Webhook receiver

### 4. [Public API](./public.md)
Public endpoints for widget and analytics.

- `GET /api/public/reviews` - Get public reviews
- `GET /api/public/stats` - Get public stats
- `GET /api/public/widget` - Widget configuration
- `GET /api/public/pixel.ts` - Tracking pixel

### 5. [Admin](./admin.md)
Administrative endpoints for monitoring and management.

- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/stores` - List all stores
- `GET /api/admin/users` - List all users
- `GET /api/admin/feedback` - User feedback
- `GET /api/admin/quota` - Quota management
- `GET /api/admin/monitor-*` - Monitoring endpoints

### 6. [Analytics](./analytics.md)
Usage tracking and activity analytics.

- `POST /api/analytics/track` - Track user activity
- `GET /api/analytics/stats` - Get analytics

### 7. [Health & Status](./health.md)
System health and monitoring.

- `GET /api/health` - Health check
- `GET /api/public/stats` - Public statistics

## Error Handling

All API responses follow a consistent error format with i18n support (Arabic/English):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "حقل مطلوب مفقود",
    "statusCode": 400,
    "details": {
      "field": "email"
    }
  }
}
```

See [Error Codes](./errors.md) for complete list.

## Rate Limiting

Public endpoints are rate-limited:
- **Widget endpoints**: 100 requests/minute per IP
- **Public API**: 60 requests/minute per IP
- **Webhook**: 1000 requests/minute per store

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## Quota System

Subscription-based quotas (reviews per month):
- **TRIAL**: 10 reviews/month
- **PAID_MONTHLY**: 1,000 reviews/month (21 SAR)
- **PAID_ANNUAL**: 1,000 reviews/month (210 SAR/year)

Quota headers:
```http
X-Quota-Limit: 1000
X-Quota-Used: 250
X-Quota-Remaining: 750
X-Quota-Reset: 2025-02-01T00:00:00Z
```

## Request ID Tracking

All responses include a unique request ID for debugging:

```http
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

## Localization

API supports Arabic and English. Specify language via:

```http
Accept-Language: ar
```

Default locale: Arabic (`ar`)

## Interactive Documentation

- [OpenAPI Specification](../openapi.yaml)
- [Swagger UI](/api/docs) - Interactive API explorer

## Support

- Documentation: https://docs.theqah.com
- Email: support@theqah.com
- GitHub Issues: https://github.com/theqah/theqah
