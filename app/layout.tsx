import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import { Header } from '@/app/components/layout/header';
import { NoTransitions } from '@/app/components/layout/no-transitions';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants';
import { ToastProvider } from '@/providers/toast-provider';
import { QueryProvider } from '@/app/providers/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/app/providers/auth-provider';
import { ScrollToTopButton } from '@/components/features/ScrollToTopButton';
import { WebVitalsReporter } from '@/app/components/analytics/web-vitals-reporter';
// import { OnboardingProvider } from "@/app/components/onboarding/onboarding-provider";
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700'],
  preload: true,
  adjustFontFallback: true,
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  preload: true,
  adjustFontFallback: true,
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  preload: false,
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'tech',
    'technology',
    'news',
    'trends',
    'programming',
    'development',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: '/',
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
  return (
    <html
      lang="ja"
      className={`no-transitions h-full ${spaceGrotesk.variable} ${inter.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
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
                } catch (error) {
                  // Theme initialization error is non-critical, suppress in production
                  if (typeof console !== 'undefined' && console.warn) {
                    console.warn('Failed to initialize theme:', error);
                  }
                }
              })();
            `,
          }}
        />
      </head>
      {/* 重要: overflow-hiddenは追加しないこと。トップページ以外でスクロール不可になる */}
      <body className="flex h-full flex-col overflow-hidden antialiased">
        <NoTransitions />
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              {/* <OnboardingProvider> */}
              <Header />
              <main className="flex-1 overflow-y-auto">{children}</main>
              <ScrollToTopButton />
              <ToastProvider />
              <WebVitalsReporter />
              {/* </OnboardingProvider> */}
            </QueryProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
