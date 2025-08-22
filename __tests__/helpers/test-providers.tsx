import React from 'react';
import { ThemeProvider } from '@/app/providers/theme-provider';

// テスト用のThemeProviderラッパー
export const TestProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider>
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