import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/app/components/layout/header";
import { Footer } from "@/app/components/layout/footer";
import { NoTransitions } from "@/app/components/layout/no-transitions";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { ToastProvider } from "@/providers/toast-provider";
import { QueryProvider } from "@/app/providers/query-provider";
// import { OnboardingProvider } from "@/app/components/onboarding/onboarding-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ["tech", "technology", "news", "trends", "programming", "development"],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full no-transitions light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'system';
                  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  const activeTheme = theme === 'system' ? systemTheme : theme;
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(activeTheme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <NoTransitions />
        <QueryProvider>
          {/* <OnboardingProvider> */}
            <Header />
            <main className="flex-1 overflow-auto">{children}</main>
            <Footer />
            <ToastProvider />
          {/* </OnboardingProvider> */}
        </QueryProvider>
      </body>
    </html>
  );
}
