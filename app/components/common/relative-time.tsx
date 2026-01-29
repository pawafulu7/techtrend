'use client';

import { useState, useEffect } from 'react';

interface RelativeTimeProps {
  date: Date | string;
  /** 「NEW」表示の閾値（時間）。デフォルト24時間 */
  newThresholdHours?: number;
  /** NEWバッジを表示するか */
  showNewBadge?: boolean;
  className?: string;
}

/**
 * 相対時間を表示するコンポーネント
 *
 * Date.now()をuseEffect内で呼び出すことで、
 * React Compilerのpurityルールに準拠しています。
 *
 * SSR時はnullを返し、クライアントでのみ時間を計算します。
 */
export function RelativeTime({
  date,
  newThresholdHours = 24,
  showNewBadge = false,
  className,
}: RelativeTimeProps) {
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);

  // Initialize state in useEffect to avoid Date.now() during render (purity rule)
  useEffect(() => {
    const targetDate = typeof date === 'string' ? new Date(date) : date;

    // Validate parsed date to avoid NaN
    if (Number.isNaN(targetDate.getTime())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: keep null for invalid date
      setHoursAgo(null);
      return;
    }

    const calculateHours = () => {
      return Math.floor((Date.now() - targetDate.getTime()) / (1000 * 60 * 60));
    };

    setHoursAgo(calculateHours());

    // 1分ごとに更新（リアルタイム性が必要な場合）
    const interval = setInterval(() => {
      setHoursAgo(calculateHours());
    }, 60000);

    return () => clearInterval(interval);
  }, [date]);

  // SSR時またはマウント前はnullを返す
  if (hoursAgo === null) {
    return null;
  }

  const isNew = hoursAgo < newThresholdHours;

  if (showNewBadge) {
    return isNew ? <span className={className}>NEW</span> : null;
  }

  // 時間の表示フォーマット
  if (hoursAgo < 1) {
    return <span className={className}>たった今</span>;
  }
  if (hoursAgo < 24) {
    return <span className={className}>{hoursAgo}時間前</span>;
  }
  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 7) {
    return <span className={className}>{daysAgo}日前</span>;
  }
  const weeksAgo = Math.floor(daysAgo / 7);
  if (weeksAgo < 4) {
    return <span className={className}>{weeksAgo}週間前</span>;
  }
  const monthsAgo = Math.floor(daysAgo / 30);
  return <span className={className}>{monthsAgo}ヶ月前</span>;
}

/**
 * 記事の新着判定を行うフック
 *
 * Date.now()をuseEffect内で呼び出すことで、
 * React Compilerのpurityルールに準拠しています。
 */
export function useIsNewArticle(
  publishedAt: Date | string,
  thresholdHours: number = 24
): boolean | null {
  const [isNew, setIsNew] = useState<boolean | null>(null);

  // Initialize state in useEffect to avoid Date.now() during render (purity rule)
  useEffect(() => {
    const publishedDate =
      typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;

    // Validate parsed date to avoid NaN
    if (Number.isNaN(publishedDate.getTime())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: keep null for invalid date
      setIsNew(null);
      return;
    }

    const hoursAgo = Math.floor(
      (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60)
    );

    setIsNew(hoursAgo < thresholdHours);
  }, [publishedAt, thresholdHours]);

  return isNew;
}
