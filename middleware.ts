// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 60_000; // 60s نافذة
const MAX_REQS = 20;      // أقصى عدد داخل النافذة

// in-memory (تجريبي فقط؛ للإنتاج استخدم Redis/KV)
const buckets = new Map<string, { resetAt: number; count: number }>();

function getClientIp(req: NextRequest) {
  // الأفضلية لـ Cloudflare، ثم XFF، ثم X-Real-IP، ثم req.ip، ثم fallback
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const ip = xff.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const real = req.headers.get("x-real-ip");
  if (real) return real;

  // قد تكون متاحة حسب المنصة
  const maybeIp = (req as unknown as { ip?: string }).ip;
  if (maybeIp) return maybeIp;

  // أضعف fallback
  const ua = req.headers.get("user-agent") || "ua:unknown";
  return `anon:${ua.slice(0, 32)}`;
}

function rateKey(req: NextRequest) {
  return `${getClientIp(req)}:${req.nextUrl.pathname}`;
}

function touchBucket(now: number, b?: { resetAt: number; count: number }) {
  if (!b || now >= b.resetAt) {
    return { resetAt: now + WINDOW_MS, count: 0 };
  }
  return b;
}

function cleanupExpired(now: number) {
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}

export function middleware(req: NextRequest) {
  // تجاوز الـ static files والـ widgets
  if (req.nextUrl.pathname.startsWith("/widgets/") || 
      req.nextUrl.pathname.startsWith("/_next/") ||
      req.nextUrl.pathname.startsWith("/api/public/")) {
    return NextResponse.next();
  }

  // CORS للـ admin APIs
  if (req.nextUrl.pathname.startsWith("/api/admin/")) {
    const ALLOW = [
      "http://localhost:3000",
      "https://theqah.com.sa", 
      "https://www.theqah.com.sa",
    ];
    
    const origin = req.headers.get('origin') || '';
    const res = NextResponse.next();

    if (ALLOW.includes(origin)) {
      res.headers.set('Access-Control-Allow-Origin', origin);
      res.headers.set('Vary', 'Origin');
      res.headers.set('Access-Control-Allow-Credentials', 'true');
      res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }

    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: res.headers });
    }
    return res;
  }
  
  // طبّق فقط على الراوتس المحددة في config.matcher
  // وتجاوز preflight
  if (req.method === "OPTIONS") return NextResponse.next();

  const now = Date.now();
  cleanupExpired(now);

  const key = rateKey(req);
  const bucket = touchBucket(now, buckets.get(key));

  if (bucket.count >= MAX_REQS) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const res = new NextResponse("Too Many Requests", { status: 429 });
    res.headers.set("Retry-After", String(retryAfter));
    res.headers.set("RateLimit-Policy", `${MAX_REQS};w=${Math.round(WINDOW_MS / 1000)}`);
    res.headers.set("RateLimit-Remaining", "0");
    res.headers.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    return res;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, MAX_REQS - bucket.count);
  const res = NextResponse.next();
  res.headers.set("RateLimit-Policy", `${MAX_REQS};w=${Math.round(WINDOW_MS / 1000)}`);
  res.headers.set("RateLimit-Remaining", String(remaining));
  res.headers.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
  return res;
}

export const config = {
  matcher: [
    "/api/zid/webhook", 
    "/api/reviews/submit",
    "/api/admin/:path*",
    // استبعاد الـ widgets والـ static files
    "/((?!widgets|_next|favicon|robots|sitemap).*)"
  ],
};
