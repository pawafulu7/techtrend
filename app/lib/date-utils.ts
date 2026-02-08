/**
 * 日付範囲フィルター用のユーティリティ関数
 */

// 定数定義（型の派生元）
export const DATE_RANGE_OPTIONS = [
  { value: 'all', label: '全期間' },
  { value: 'today', label: '今日' },
  { value: 'week', label: '今週' },
  { value: 'month', label: '今月' },
  { value: 'three_months', label: '過去3ヶ月' },
] as const;

// 定数から型を派生させて重複をなくす
export type DateRangeOption = (typeof DATE_RANGE_OPTIONS)[number]['value'];

/**
 * 日付範囲文字列から開始日を計算
 * @param range - 日付範囲の文字列
 * @returns 開始日のDateオブジェクト、全期間の場合はnull
 */
export function getDateRangeFilter(range: string): Date | null {
  const now = new Date();

  // 後方互換: 旧値 '3months' を新値に正規化
  const normalized = range === '3months' ? 'three_months' : range;

  switch (normalized) {
    case 'today': {
      // 今日の0時0分0秒から
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return today;
    }

    case 'week': {
      // 7日前から
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return weekAgo;
    }

    case 'month': {
      // 1ヶ月前から
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return monthAgo;
    }

    case 'three_months': {
      // 3ヶ月前から
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return threeMonthsAgo;
    }

    case 'all':
    default:
      // 全期間
      return null;
  }
}

/**
 * 日付範囲のラベルを取得
 * @param value - 日付範囲の値
 * @returns ラベル文字列
 */
export function getDateRangeLabel(value: string): string {
  // 後方互換: 旧値 '3months' を新値に正規化
  const v = value === '3months' ? 'three_months' : value;
  const option = DATE_RANGE_OPTIONS.find((opt) => opt.value === v);
  return option?.label || '全期間';
}

/**
 * カスタム日付範囲（from-to）をパース・バリデーション
 * 最大3ヶ月の範囲制限を適用
 * @returns パース結果。無効な場合はnull
 */
export function parseDateFromTo(
  dateFrom: string | undefined | null,
  dateTo: string | undefined | null
): { from: Date; to: Date } | null {
  const now = new Date();

  // 'YYYY-MM-DD' 形式はUTCとして解釈されるため、ローカルタイムで解釈
  const parseLocalDate = (s: string) => new Date(`${s}T00:00:00`);

  let from: Date;
  let to: Date;

  if (dateFrom && dateTo) {
    from = parseLocalDate(dateFrom);
    to = parseLocalDate(dateTo);
  } else if (dateFrom) {
    from = parseLocalDate(dateFrom);
    to = now;
  } else if (dateTo) {
    to = parseLocalDate(dateTo);
    from = new Date(to);
    from.setMonth(from.getMonth() - 3);
  } else {
    return null;
  }

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return null;
  }

  // 日付オーバーフロー検証（例: 2月31日 → 3月3日になるケースを拒否）
  const validateDateString = (s: string, d: Date): boolean => {
    const parts = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return false;
    return (
      d.getFullYear() === Number(parts[1]) &&
      d.getMonth() + 1 === Number(parts[2]) &&
      d.getDate() === Number(parts[3])
    );
  };
  if (dateFrom && !validateDateString(dateFrom, from)) return null;
  if (dateTo && !validateDateString(dateTo, to)) return null;

  if (from > to) {
    return null;
  }

  // 3ヶ月制限（約93日）
  const threeMonthsMs = 93 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > threeMonthsMs) {
    return null;
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

/**
 * ソート順に応じた日付フィルタフィールドを返す
 */
export function getDateFieldForSort(
  sortBy: string | undefined
): 'publishedAt' | 'createdAt' {
  return sortBy === 'createdAt' ? 'createdAt' : 'publishedAt';
}

/**
 * 日付をフォーマット
 * @param date - フォーマットする日付
 * @returns フォーマットされた文字列 (YYYY-MM-DD)
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 相対的な日付表記を生成
 * @param date - 対象の日付
 * @returns 相対的な表記 (例: "3日前", "1週間前")
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMin === 0) {
        return 'たった今';
      }
      return `${diffMin}分前`;
    }
    return `${diffHours}時間前`;
  } else if (diffDays === 1) {
    return '昨日';
  } else if (diffDays < 7) {
    return `${diffDays}日前`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}週間前`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}ヶ月前`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years}年前`;
  }
}
