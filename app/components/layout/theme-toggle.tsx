'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui-v2/button-v2';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: SSR-safe mount tracking
    setMounted(true);
  }, []);

  // disabled 属性は使わない。ブラウザが hydration 前に disabled を外すと
  // （フォーム状態の復元・拡張機能など）サーバー HTML と食い違うため、
  // data-disabled（ButtonV2 で disabled と同じスタイル）と aria-disabled で表す。
  // onClick を渡さないので、マウント前は押しても何も起きない。
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 lg:h-9 lg:w-9"
        aria-label="テーマ切り替え"
        aria-disabled="true"
        data-disabled="true"
        tabIndex={-1}
        aria-busy="true"
        data-state="pre-mount"
        data-testid="theme-toggle-button"
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-11 w-11 lg:h-9 lg:w-9"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={
        theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'
      }
      aria-pressed={theme === 'dark'}
      data-testid="theme-toggle-button"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
