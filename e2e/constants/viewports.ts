/**
 * E2E テスト用 viewport 定数
 *
 * Playwright の `page.setViewportSize()` に渡す既定サイズ。
 * 直書きを避けて意図 (mobile/tablet/desktop) を明示する。
 */

export const MOBILE_VIEWPORT = { width: 375, height: 667 } as const;
export const TABLET_VIEWPORT = { width: 768, height: 1024 } as const;
export const DESKTOP_VIEWPORT = { width: 1920, height: 1080 } as const;
