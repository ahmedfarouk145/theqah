/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

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
  // ======= Compression =======
  // Enable gzip compression for API responses and pages (L4)
  compress: true,

  // ======= Performance Budgets =======
  // Enforce bundle size limits to prevent performance regression
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-progress',
      '@radix-ui/react-switch',
      '@radix-ui/react-label',
      '@radix-ui/react-slot',
      'date-fns',
      'sonner',
    ],
  },
  // Bundle analysis warnings
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    // Exclude Firebase Cloud Functions from compilation
    config.externals = config.externals || [];
    config.externals.push({
      'firebase-functions': 'firebase-functions',
      'firebase-admin': 'firebase-admin',
    });

    if (!isServer) {
      // Warn if bundle exceeds limits
      config.performance = {
        maxAssetSize: 300000, // 300 KB
        maxEntrypointSize: 500000, // 500 KB
        hints: 'warning',
      };
    }
    return config;
  },

  // Exclude functions directory from Next.js compilation
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'].map(ext => `page.${ext}`).concat(['tsx', 'ts', 'jsx', 'js']),

  // Ignore functions directory during build
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src', 'pages', 'components', 'lib', 'utils'],
  },
  // ======= إعدادات الصور =======
  images: {
    // الدومينات المسموحة للصور الخارجية
    domains: [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'ucarecdn.com',  // Uploadcare CDN
      'lh3.googleusercontent.com', // صور Google
    ],
    // أنماط أكثر تفصيلاً للصور
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/theqah-d3ee0.firebasestorage.app/o/**',
      },
      {
        protocol: 'https',
        hostname: 'ucarecdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      }
    ],
    // أحجام الصور المحسنة
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // تنسيقات الصور المدعومة
    formats: ['image/webp', 'image/avif'],
    // مدة التخزين المؤقت
    minimumCacheTTL: 60,
  },

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

module.exports = withBundleAnalyzer(nextConfig);
