'use client';

import { useEffect, useState } from 'react';

interface LiveStatusProps {
  /** 読み上げる文言 */
  children: string;
  className?: string;
}

/**
 * 表示と同時に読み上げたい文言の live region（issue #701）。
 * role="status" を文言ごと描くと、領域ができた時点で文言が既にあるため、読み上げない
 * スクリーンリーダーがある（WCAG ARIA22: 領域は文言より先に存在させる）。
 * そこで空の領域を先に描き、マウントの後に文言を入れる。サーバー描画でも空で出る
 */
export function LiveStatus({ children, className }: LiveStatusProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 領域を描いた後に文言を入れて読み上げさせる
    setText(children);
  }, [children]);

  return (
    <span role="status" className={className}>
      {text}
    </span>
  );
}
