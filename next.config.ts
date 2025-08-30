/** @type {import('next').NextConfig} */
const ALLOWED_ANCESTORS = [
  "'self'",
  "https://*.zid.sa",
  "https://*.zid.store",
  // زوّد نطاقات أخرى حسب الحاجة:
  // "https://*.salla.sa",
];

if (process.env.NODE_ENV !== "production") {
  ALLOWED_ANCESTORS.push("http://localhost:3000");
  // أو اسم الدومين المحلي لو بتستخدم hosts:
  // ALLOWED_ANCESTORS.push("http://dev.theqah.test:3000");
}

const cspFrameAncestors = `frame-ancestors ${ALLOWED_ANCESTORS.join(" ")};`;

const nextConfig = {
  async headers() {
    return [
      // يطبّق على صفحة /embedded نفسها
      {
        source: "/embedded",
        headers: [
          { key: "Content-Security-Policy", value: cspFrameAncestors },
          // متعمد: لا نضيف X-Frame-Options هنا
        ],
      },
      // ويطبّق على أي مسارات فرعية تحت /embedded
      {
        source: "/embedded/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspFrameAncestors },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
