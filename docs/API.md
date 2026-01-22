# TheQah API Documentation

> مستند واجهات برمجة التطبيقات لمنصة ثقة - مشتري موثق

## Base URL

```
Production: https://theqah.com.sa/api
Development: http://localhost:3000/api
```

## Authentication

Most endpoints require authentication via Firebase Auth token:

```http
Authorization: Bearer <firebase-id-token>
```

---

## Public Endpoints (No Auth Required)

### GET /public/reviews

Get published reviews for a store.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| storeId | string | ✅ | Store UID |
| productId | string | ❌ | Filter by product |
| limit | number | ❌ | Max reviews (default: 50, max: 100) |
| sort | string | ❌ | `asc` or `desc` (default: desc) |

**Response:**
```json
{
  "reviews": [
    {
      "id": "review_123",
      "stars": 5,
      "text": "منتج ممتاز!",
      "publishedAt": 1705845600000,
      "trustedBuyer": true,
      "author": { "displayName": "أحمد م." }
    }
  ],
  "pagination": { "hasMore": true, "nextCursor": "abc123" }
}
```

---

### GET /public/reviews/resolve

Resolve store UID from domain.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| host | string | ✅ | Store domain (e.g., `mystore.com`) |

**Response:**
```json
{
  "storeUid": "salla:123456",
  "certificatePosition": "auto"
}
```

---

### POST /feedback

Submit user feedback.

**Request Body:**
```json
{
  "type": "bug|feature|question|other",
  "message": "رسالة التعليق",
  "userEmail": "email@example.com",
  "userName": "اسم المستخدم"
}
```

---

## Store Owner Endpoints (Auth Required)

### GET /reviews/list

Get store reviews with filters.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | number | Max reviews (default: 50) |
| cursor | string | Pagination cursor |
| status | string | `pending`, `approved`, `rejected`, `published` |
| search | string | Search in text/author/product |
| startDate | number | Unix timestamp |
| endDate | number | Unix timestamp |
| stars | number | 1-5 |
| productId | string | Filter by product |

**Response:**
```json
{
  "reviews": [...],
  "pagination": { "hasMore": true, "nextCursor": "abc", "limit": 50 }
}
```

---

### POST /reviews/submit

Submit a new review (with token).

**Request Body:**
```json
{
  "orderId": "order-123",
  "stars": 5,
  "text": "منتج رائع!",
  "tokenId": "token-abc",
  "images": ["https://ucarecdn.com/..."],
  "authorName": "أحمد",
  "authorShowName": true
}
```

---

### POST /reviews/update-status

Update review status.

**Request Body:**
```json
{
  "reviewId": "review_123",
  "status": "approved|rejected"
}
```

---

### GET /orders/export

Export orders as JSON or CSV.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| format | string | `json` or `csv` |
| limit | number | Max orders (default: 1000) |
| startDate | number | Unix timestamp |
| endDate | number | Unix timestamp |

---

### GET /analytics/trends

Get review analytics trends.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| days | number | Period in days (default: 30, max: 90) |

**Response:**
```json
{
  "period": { "days": 30, "startDate": "2026-01-01T00:00:00Z" },
  "summary": {
    "totalReviews": 45,
    "averageRating": 4.3,
    "reviewsPerDay": 1.5,
    "trend": "up|down|stable"
  },
  "starsDistribution": [
    { "stars": 5, "count": 20, "percentage": 44 },
    { "stars": 4, "count": 15, "percentage": 33 }
  ],
  "daily": [
    { "date": "2026-01-20", "count": 5, "averageRating": 4.5 }
  ],
  "weekly": [
    { "week": "2026-W03", "count": 12, "averageRating": 4.2 }
  ]
}
```

---

### GET /usage/sms

Get SMS usage and cost estimation.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| days | number | Period in days (default: 30) |
| period | string | `month` for current month |

**Response:**
```json
{
  "summary": {
    "totalSent": 120,
    "successful": 115,
    "failed": 5,
    "successRate": 96
  },
  "cost": {
    "estimated": 5.75,
    "currency": "SAR"
  },
  "projection": {
    "projectedMonthly": 360,
    "projectedCost": 18.00
  }
}
```

---

## Webhook Endpoints

### POST /salla/webhook

Salla webhook receiver.

**Headers:**
```
x-salla-signature: <hmac-signature>
```

**Events Handled:**
- `app.store.authorize`
- `app.installed`
- `order.created`
- `order.updated`
- `order.cancelled`
- `order.completed`

---

### POST /zid/webhook

Zid webhook receiver (in `/zid/api/`).

---

## Admin Endpoints

### GET /admin/stats

Get platform statistics.

### GET /admin/reviews

List all reviews with filters.

### POST /admin/reviews/bulk

Bulk update review status.

**Request Body:**
```json
{
  "action": "publish|unpublish|delete",
  "reviewIds": ["review_1", "review_2"],
  "reason": "Spam content"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

**Common Error Codes:**
| Code | HTTP | Description |
|------|------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | No permission |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid input |
| RATE_LIMITED | 429 | Too many requests |

---

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Public APIs | 100 req/min |
| Authenticated APIs | 300 req/min |
| Webhooks | 1000 req/min |

---

## Changelog

### v1.0.0 (Jan 21, 2026)
- Initial API documentation
- Added analytics/trends endpoint
- Added usage/sms endpoint
- Added orders/export endpoint
- Added search and date filtering to reviews/list
