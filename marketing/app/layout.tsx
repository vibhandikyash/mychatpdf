import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { getSiteSettings, SITE_URL } from "@/lib/cms";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: settings.defaultSeoTitle ?? settings.siteName,
      template: `%s | ${settings.siteName}`,
    },
    description: settings.defaultSeoDescription,
    openGraph: {
      siteName: settings.siteName,
      type: "website",
      images: ["/logo-horizontal.png"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#2068f8",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.companyName ?? settings.siteName,
    url: SITE_URL,
    logo: `${SITE_URL}/logo-horizontal.png`,
    ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.siteName,
    url: SITE_URL,
    ...(settings.defaultSeoDescription ? { description: settings.defaultSeoDescription } : {}),
  };

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        {/* Gates reveal-animation hidden states so content stays visible without JS. */}
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.add("js")` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }}
        />
      </head>
      <body className="text-ink flex min-h-full flex-col bg-white font-sans">
        <a
          href="#main"
          className="bg-brand-gradient sr-only z-50 rounded-full px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Header settings={settings} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer settings={settings} />
      </body>
    </html>
  );
}
