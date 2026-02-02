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
          <meta name="description" content="مشتري موثّق - منصة توثيق التقييمات الآلية" />
        </Head>
        <Component {...pageProps} />
        <SpeedInsights />
        <Analytics />
      </AuthProvider>
    </ThemeProvider>
  );
}

