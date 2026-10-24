'use client';

import { useState } from 'react';

/**
 * ポーリングの手動の一時停止・再開（管理画面のジョブ・パフォーマンスで使う）。
 * タブが裏にある間の停止は TanStack Query が行う（refetchIntervalInBackground を指定しない限り、
 * フォーカスの無いウィンドウでは refetchInterval の再取得をしない）ので、ここでは扱わない。
 * 以前は visibilitychange で再開していたため、手動で止めてもタブを戻すと再開していた
 */
export function usePollingControl(interval: number = 30000) {
  const [isActive, setIsActive] = useState(true);

  return {
    isActive,
    interval,
    pause: () => setIsActive(false),
    resume: () => setIsActive(true),
  };
}
