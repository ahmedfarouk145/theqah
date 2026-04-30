// src/pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document';

const TWITTER_PIXEL_ID = process.env.NEXT_PUBLIC_TWITTER_PIXEL_ID;

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
                <link rel="icon" href="/favicon.ico" sizes="any" />
                <link rel="shortcut icon" href="/favicon.ico" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
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

                {/* Twitter (X) Pixel — base */}
                {TWITTER_PIXEL_ID && (
                    <script
                        dangerouslySetInnerHTML={{
                            __html: `
                                !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
                                },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
                                a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
                                twq('config','${TWITTER_PIXEL_ID}');
                            `,
                        }}
                    />
                )}

                {/* Google Fonts - loaded as link instead of CSS @import to avoid render-blocking */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />

                {/* Preconnect to YouTube thumbnails (for video facade pattern) */}
                <link rel="preconnect" href="https://img.youtube.com" />

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
