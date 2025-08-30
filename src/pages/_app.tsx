import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import Head from 'next/head';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Head>
        <title>theqah</title>

        {/* Standard favicon */}
        <link rel="icon" href="/favicon.ico" />

        {/* PNG favicons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />

        {/* Apple iOS Touch Icon */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Android & PWA manifest */}
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#ffffff" />

        {/* Optional: description for SEO */}
        <meta name="description" content="theqah - Your website description here" />
      </Head>
<Component {...pageProps} />
    </AuthProvider>
  );
}
