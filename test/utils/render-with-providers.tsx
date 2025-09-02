import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import type { Session } from 'next-auth';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  session?: Session | null;
  initialQueryState?: any;
}

/**
 * プロバイダー付きでコンポーネントをレンダリングするユーティリティ
 * 
 * @param ui - レンダリングするReactコンポーネント
 * @param options - レンダリングオプション
 * @returns レンダリング結果
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    session = null,
    initialQueryState,
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  // 各テストで新しいQueryClientを作成
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // テスト時はリトライを無効化
        gcTime: Infinity, // ガベージコレクションを無効化
      },
    },
  });

  if (initialQueryState) {
    queryClient.setQueryData([], initialQueryState);
  }

  function AllTheProviders({ children }: { children: React.ReactNode }) {
    return (
      <SessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </QueryClientProvider>
      </SessionProvider>
    );
  }

  const renderResult = render(ui, { wrapper: AllTheProviders, ...renderOptions });

  return {
    ...renderResult,
    queryClient, // テストでQueryClientにアクセスできるようにする
  };
}

// 便利なヘルパー関数
export { renderWithProviders as render };
export * from '@testing-library/react';