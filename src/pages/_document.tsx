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
                {/* Favicons */}
                <link rel="icon" href="/logo.png" />
                <link rel="shortcut icon" href="/logo.png" />
                <link rel="icon" type="image/png" sizes="32x32" href="/logo.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/logo.png" />
                <link rel="apple-touch-icon" href="/logo.png" />
                <link rel="manifest" href="/site.webmanifest" />
                <meta name="theme-color" content="#ffffff" />

                {/* Google Analytics (GA4) */}
                <script
                    async
                    src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-V2FV8T4ER8'}`}
                />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            window.dataLayer = window.dataLayer || [];
                            function gtag(){dataLayer.push(arguments);}
                            gtag('js', new Date());
                            gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-V2FV8T4ER8'}', {
                                page_path: window.location.pathname,
                            });
                        `,
                    }}
                />

                {/* Preconnect to Google Fonts for faster font loading */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

                {/* Preconnect to Firebase services */}
                <link rel="preconnect" href="https://firebaseapp.com" />
                <link rel="preconnect" href="https://firestore.googleapis.com" />

                {/* Preconnect to Salla API */}
                <link rel="preconnect" href="https://api.salla.dev" />
                <link rel="preconnect" href="https://api.salla.sa" />

                {/* Preconnect to Google Analytics */}
                <link rel="preconnect" href="https://www.googletagmanager.com" />
                <link rel="dns-prefetch" href="https://www.googletagmanager.com" />

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
