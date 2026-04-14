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
            <title>مشتري موثّق — منصة توثيق تقييمات المتاجر الإلكترونية وزيادة ثقة العملاء</title>
            <meta name="description" content="أول منصة سعودية تربط كل تقييم بمشترٍ حقيقي عبر أتمتة كاملة. وثّق تقييمات متجرك على سلة وزد، واعرض شارة الثقة التي تدفع العميل للشراء فوراً وتضاعف مبيعاتك." />
            <meta name="viewport" content="width=device-width, initial-scale=1" />

            {/* Open Graph */}
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="مشتري موثّق" />
            <meta property="og:title" content="مشتري موثّق — وثّق تقييمات متجرك وضاعف مبيعاتك" />
            <meta property="og:description" content="أول منصة سعودية تربط كل تقييم بمشترٍ حقيقي. شارة ثقة تدفع العميل للشراء فوراً." />
            <meta property="og:image" content="https://www.theqah.com.sa/logo.png" />
            <meta property="og:locale" content="ar_SA" />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary" />
            <meta name="twitter:title" content="مشتري موثّق — وثّق تقييمات متجرك وضاعف مبيعاتك" />
            <meta name="twitter:description" content="أول منصة سعودية تربط كل تقييم بمشترٍ حقيقي. شارة ثقة تدفع العميل للشراء فوراً." />
            <meta name="twitter:image" content="https://www.theqah.com.sa/logo.png" />
          </Head>
          <Component {...pageProps} />
          <SpeedInsights />
          <Analytics />
        </BlogAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

