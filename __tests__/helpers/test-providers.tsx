import React from 'react';
import { ThemeProvider } from '@/components/providers/theme-provider';

// テスト用のThemeProviderラッパー（本番の app/layout.tsx と同じ next-themes の Provider と設定）
export const TestProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
};

// カスタムrender関数
import { render as rtlRender, RenderOptions } from '@testing-library/react';

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return rtlRender(ui, { wrapper: TestProviders, ...options });
}
