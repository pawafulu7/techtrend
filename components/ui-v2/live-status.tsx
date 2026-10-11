'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface LiveStatusProps {
  /** 読み上げる文言 */
  message: string;
  /** 見た目の表示（文言を含む）。読み上げは message が受け持つ */
  children?: ReactNode;
  /** 見た目の表示を包む要素の class */
  className?: string;
}

// 領域を描いてから文言を入れるまでの間。同じタスクの中で入れると、領域の追加と文言の変化が
// まとめて扱われ、読み上げないスクリーンリーダーがある
const ANNOUNCE_DELAY_MS = 100;

/**
 * 表示と同時に読み上げたい文言の live region（issue #701）。
 * role="status" を文言ごと描くと、領域ができた時点で文言が既にあるため、読み上げない
 * スクリーンリーダーがある（WCAG ARIA22: 領域は文言より先に存在させる）。
 * - 空の領域を先に描き、マウントの少し後に文言を入れる
 * - status の文言が追いつくまで（サーバー描画・hydration 前・文言の更新直後）は、見た目の
 *   表示をそのまま読めるようにする。追いついた後は見た目の表示を読み上げから外し、二重に読ませない
 */
export function LiveStatus({ message, children, className }: LiveStatusProps) {
  const [announced, setAnnounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(message), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <>
      {/* 一部の環境は status の暗黙の aria-atomic を扱わないので明示する（ARIA22） */}
      <span role="status" aria-atomic="true" className="sr-only">
        {announced}
      </span>
      {children !== undefined && (
        <div
          className={className}
          aria-hidden={announced === message || undefined}
        >
          {children}
        </div>
      )}
    </>
  );
}
