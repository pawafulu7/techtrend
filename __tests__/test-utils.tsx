import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// テスト用のQueryClient設定
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // テストでは自動リトライを無効化
      gcTime: 0, // テストではキャッシュを無効化
    },
  },
});

// カスタムプロバイダー
interface TestProviderProps {
  children: React.ReactNode;
}

function TestProvider({ children }: TestProviderProps) {
  const queryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// カスタムレンダー関数
function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: TestProvider, ...options });
}

// Re-export everything
export * from '@testing-library/react';
export { customRender as render, createTestQueryClient };