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
    return [
      // يطبّق على /embedded مباشرة
      {
        source: "/embedded",
        headers: [
          { key: "Content-Security-Policy", value: cspFrameAncestors },
          // لا تضيف X-Frame-Options هنا — CSP كافي
        ],
      },
      // ويطبّق على أي مسارات فرعية تحت /embedded
      {
        source: "/embedded/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspFrameAncestors },
        ],
      },
      // (اختياري) لو عندك مسار تاني للودجت:
      // {
      //   source: "/widget/:path*",
      //   headers: [{ key: "Content-Security-Policy", value: cspFrameAncestors }],
      // },
    ];
  },
};

module.exports = nextConfig;
