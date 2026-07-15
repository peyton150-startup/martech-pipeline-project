import type { Metadata } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import "./globals.css";
import ConsentBanner from "@/components/ConsentBanner";
import DebugOverlay from "@/components/DebugOverlay";
import PostHogProvider from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "Wayfarer Collection",
  description:
    "Demo travel site for a martech pipeline: dataLayer, GTM, PostHog, personalization.",
};

// Set this once you create the GTM container on day 2.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID; // e.g. "GTM-XXXXXXX"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* dataLayer must exist before GTM and before any trackEvent call */}
        <Script id="datalayer-init" strategy="beforeInteractive">
          {`window.dataLayer = window.dataLayer || [];`}
        </Script>
        <Script id="gtm-consent-default" strategy="beforeInteractive">
          {`
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              analytics_storage: 'denied',
              ad_storage: 'denied',
              wait_for_update: 500
            });
          `}
        </Script>
        {GTM_ID && (
          <Script id="gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        )}
      </head>
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <ConsentBanner />
        {/* Dev observability panel — renders nothing unless ?debug=1. */}
        <DebugOverlay />
      </body>
    </html>
  );
}
