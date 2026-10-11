import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from './loading-spinner';

interface LoadingOverlayProps {
  /** スピナーに添える文言（何を読み込んでいるか） */
  message: string;
  /** 奥に見せるスケルトン */
  children: ReactNode;
  className?: string;
}

/**
 * 読み込み中の表示（issue #701）。奥にスケルトンで読み込み後の並びを見せ、薄い膜をかけた
 * 前面にスピナーを出す。スピナーとスケルトンを同じ階層に並べず、「読み込み中」を前面の1つにする。
 * スピナーは長い一覧でも見える位置に留める（sticky）
 */
export function LoadingOverlay({
  message,
  children,
  className,
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      <div aria-hidden="true">{children}</div>
      <div className="bg-background/60 absolute inset-0 flex justify-center">
        <div className="sticky top-24 h-fit pt-16">
          <LoadingSpinner message={message} fullPage={false} />
        </div>
      </div>
    </div>
  );
}
