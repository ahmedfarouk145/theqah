// src/pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document';

/**
 * Custom Document for Next.js
 * - Sets lang="ar" for RTL Arabic support (Lighthouse accessibility)
 * - Adds preconnect hints for faster external resource loading
 * - Adds dns-prefetch as fallback for older browsers
 */
export default function Document() {
    return (
        <Html lang="ar" dir="rtl">
            <Head>
                {/* Preconnect to Google Fonts for faster font loading */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

                {/* Preconnect to Firebase services */}
                <link rel="preconnect" href="https://firebaseapp.com" />
                <link rel="preconnect" href="https://firestore.googleapis.com" />

                {/* Preconnect to Salla API */}
                <link rel="preconnect" href="https://api.salla.dev" />
                <link rel="preconnect" href="https://api.salla.sa" />

                {/* DNS prefetch as fallback for non-font services */}
                <link rel="dns-prefetch" href="https://firebaseapp.com" />
                <link rel="dns-prefetch" href="https://api.salla.dev" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
