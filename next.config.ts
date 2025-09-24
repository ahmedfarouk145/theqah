/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// 🧱 الدومينات المسموح لها تعمل embed (iframe) لصفحاتك
const ALLOWED_ANCESTORS = [
  "'self'",
  // متاجر زد:
  "https://*.zid.sa",
  "https://*.zid.store",
  // متاجر سلة (الإنتاج + بيئة الديمو):
  "https://*.salla.sa",
  "https://*.salla.dev",
  // لو هتعمل embed داخل موقعك نفسه (اختياري):
  "https://www.theqah.com.sa",
  "https://theqah.com.sa",
  // معاينات Vercel (اختياري أثناء التطوير):
  "https://*.vercel.app",
];

if (!isProd) {
  ALLOWED_ANCESTORS.push("http://localhost:3000");
  // مثال لو بتستخدم دومين محلي:
  // ALLOWED_ANCESTORS.push("http://dev.theqah.test:3000");
}

// 👇 تقدر تزود سماحيات من متغير بيئة (قائمة مفصولة بفواصل)
if (process.env.CSP_EXTRA_ANCESTORS) {
  ALLOWED_ANCESTORS.push(
    ...process.env.CSP_EXTRA_ANCESTORS
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  );
}

const cspFrameAncestors = `frame-ancestors ${ALLOWED_ANCESTORS.join(" ")};`;

const nextConfig = {
  async headers() {
    // 🔒 Headers أمنية شاملة للحماية (متطلبات سلة)
    const securityHeaders = [
      // إجبار HTTPS في الإنتاج
      {
        key: "Strict-Transport-Security",
        value: isProd ? "max-age=31536000; includeSubDomains" : "max-age=0",
      },
      // منع تخمين نوع المحتوى
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      // حماية من XSS
      {
        key: "X-XSS-Protection", 
        value: "1; mode=block",
      },
      // إخفاء معلومات الخادم
      {
        key: "X-Powered-By",
        value: "",
      },
      // منع clickjacking للصفحات العادية
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
    ];

    return [
      // أمان عام لجميع الصفحات
      {
        source: "/((?!embedded|widget|api).*)",
        headers: securityHeaders,
      },
      // يطبّق على /embedded مباشرة
      {
        source: "/embedded",
        headers: [
          { key: "Content-Security-Policy", value: cspFrameAncestors },
          // باقي headers الأمنية عدا X-Frame-Options
          ...securityHeaders.filter(h => h.key !== "X-Frame-Options"),
        ],
      },
      // ويطبّق على أي مسارات فرعية تحت /embedded
      {
        source: "/embedded/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspFrameAncestors },
          ...securityHeaders.filter(h => h.key !== "X-Frame-Options"),
        ],
      },
      // API routes - أمان إضافي
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // CORS headers للتحكم بالوصول
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
