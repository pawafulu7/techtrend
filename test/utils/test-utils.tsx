import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * カスタムレンダー関数
 * React Testing Libraryのrender関数を拡張
 */
export function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, options);
}

/**
 * userEventのセットアップ済みインスタンスを返す
 */
export function setupUser() {
  return userEvent.setup();
}

// re-export everything
export * from '@testing-library/react';
export { customRender as render, setupUser };