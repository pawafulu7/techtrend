import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from './loading-spinner';

interface LoadingOverlayProps {
  /** スピナーに添える文言（何を読み込んでいるか） */
  message: string;
  /** 奥に見せるスケルトン */
  children: ReactNode;
  /**
   * top: 長い一覧の上寄りに留める（sticky）。
   * center: カードの中など、高さの限られた領域の中央に置く（スピナーが収まる高さを呼び出し側で確保する）
   */
  placement?: 'top' | 'center';
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
  placement = 'top',
  className,
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {/* 奥はリンクを含むことがある。aria-hidden だけでは Tab で届くので、inert で操作と読み上げの両方から外す */}
      <div inert>{children}</div>
      <div
        className={cn(
          'bg-background/60 absolute inset-0 flex justify-center',
          placement === 'center' && 'items-center'
        )}
      >
        {placement === 'top' ? (
          <div className="sticky top-24 h-fit pt-16">
            <LoadingSpinner message={message} fullPage={false} />
          </div>
        ) : (
          <LoadingSpinner message={message} fullPage={false} />
        )}
      </div>
    </div>
  );
}
