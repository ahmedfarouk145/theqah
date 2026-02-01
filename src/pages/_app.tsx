import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import '@/styles/accessibility.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Head from 'next/head';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Head>
          <title>مشتري موثّق</title>

          {/* Standard favicon -> using logo.png as requested */}
          <link rel="icon" href="/logo.png" />
          <link rel="shortcut icon" href="/logo.png" />

          {/* PNG favicons */}
          <link rel="icon" type="image/png" sizes="32x32" href="/logo.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/logo.png" />

          {/* Apple iOS Touch Icon */}
          <link rel="apple-touch-icon" href="/logo.png" />

          {/* Android & PWA manifest */}
          <link rel="manifest" href="/site.webmanifest" />
          <meta name="theme-color" content="#ffffff" />

          {/* Optional: description for SEO */}
          <meta name="description" content="مشتري موثّق - منصة توثيق التقييمات الآلية" />
        </Head>
        <Component {...pageProps} />
        <SpeedInsights />
        <Analytics />
      </AuthProvider>
    </ThemeProvider>
  );
}

