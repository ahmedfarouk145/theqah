import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import '@/styles/accessibility.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { BlogAuthProvider } from '@/contexts/BlogAuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Head from 'next/head';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-V2FV8T4ER8';

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // تتبع تغييرات الصفحات في Google Analytics
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      const win = window as unknown as { gtag?: (...args: unknown[]) => void };
      if (typeof window !== 'undefined' && win.gtag) {
        win.gtag('config', GA_MEASUREMENT_ID, {
          page_path: url,
        });
      }
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return (
    <ThemeProvider>
      <AuthProvider>
        <BlogAuthProvider>
          <Head>
            <title>مشتري موثّق</title>
            <meta name="description" content="مشتري موثّق - منصة توثيق التقييمات الآلية" />
          </Head>
          <Component {...pageProps} />
          <SpeedInsights />
          <Analytics />
        </BlogAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

