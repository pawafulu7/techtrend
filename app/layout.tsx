import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/app/components/layout/header";
import { Footer } from "@/app/components/layout/footer";
import { NoTransitions } from "@/app/components/layout/no-transitions";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { ToastProvider } from "@/providers/toast-provider";
import { QueryProvider } from "@/app/providers/query-provider";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { parseThemeFromCookie } from "@/lib/theme-cookie";
// import { OnboardingProvider } from "@/app/components/onboarding/onboarding-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "optional", // swapからoptionalに変更: FOUTを防ぐ
  preload: true,
  adjustFontFallback: true, // フォールバックフォントの調整
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional", // swapからoptionalに変更: FOUTを防ぐ
  preload: true,
  adjustFontFallback: true, // フォールバックフォントの調整
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('theme')?.value;
  const theme = parseThemeFromCookie(themeCookie);
  
  // SSRでは実際のシステムテーマを判定できないため、デフォルトはlight
  // クライアント側でThemeProviderが正しいテーマを適用する
  const initialTheme = theme === 'system' ? 'light' : theme;

  return (
    <html lang="ja" className={`h-full no-transitions ${initialTheme}`}>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Critical CSS inline */
              :root {
                --radius: 0.625rem;
                --background: oklch(1 0 0);
                --foreground: oklch(0.145 0 0);
                --primary: oklch(0.205 0 0);
                --border: oklch(0.922 0 0);
              }
              .dark {
                --background: oklch(0.145 0 0);
                --foreground: oklch(0.985 0 0);
                --primary: oklch(0.922 0 0);
                --border: oklch(1 0 0 / 10%);
              }
              html.no-transitions *,
              html.no-transitions *::before,
              html.no-transitions *::after {
                transition: none !important;
                animation: none !important;
              }
              body {
                margin: 0;
                background-color: var(--background);
                color: var(--foreground);
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Cookieからテーマを取得（localStorageよりも優先）
                  const getCookie = (name) => {
                    const value = '; ' + document.cookie;
                    const parts = value.split('; ' + name + '=');
                    if (parts.length === 2) return parts.pop().split(';').shift();
                  };
                  
                  const theme = getCookie('theme') || localStorage.getItem('theme') || 'system';
                  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  const activeTheme = theme === 'system' ? systemTheme : theme;
                  
                  // 既に正しいテーマが適用されている場合はスキップ
                  const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
                  if (currentTheme !== activeTheme) {
                    document.documentElement.classList.remove('light', 'dark');
                    document.documentElement.classList.add(activeTheme);
                  }
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
        <ThemeProvider initialTheme={theme}>
          <QueryProvider>
            {/* <OnboardingProvider> */}
              <Header />
              <main className="flex-1 overflow-auto">{children}</main>
              <Footer />
              <ToastProvider />
            {/* </OnboardingProvider> */}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
