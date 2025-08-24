import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/app/components/layout/header";
import { NoTransitions } from "@/app/components/layout/no-transitions";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";
import { ToastProvider } from "@/providers/toast-provider";
import { QueryProvider } from "@/app/providers/query-provider";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { parseThemeFromCookie } from "@/lib/theme-cookie";
import { AuthProvider } from "@/app/providers/auth-provider";
import { CriticalStyles, ThemeInitializer, NoScriptStyles } from "@/app/components/common/critical-styles";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "optional",
  preload: true,
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional",
  preload: true,
  adjustFontFallback: true,
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
        <CriticalStyles />
        <ThemeInitializer cookieTheme={theme} />
        <NoScriptStyles />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full flex flex-col overflow-hidden`}
      >
        <NoTransitions />
        <AuthProvider>
          <ThemeProvider initialTheme={theme}>
            <QueryProvider>
              <Header />
              <main className="flex-1 overflow-y-auto">{children}</main>
              <ToastProvider />
            </QueryProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}