/**
 * 日付グルーピングユーティリティ
 * 閲覧履歴を「今日」「昨日」「今週」「それ以前」にグループ分けする
 */

import {
  isSameDay,
  isSameWeek,
  differenceInCalendarDays,
  parseISO,
} from 'date-fns';

/**
 * 日付グループの種類
 */
export type DateGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

/**
 * 日付グループのラベル（日本語）
 */
export const DATE_GROUP_LABELS: Record<DateGroupKey, string> = {
  today: '今日',
  yesterday: '昨日',
  thisWeek: '今週',
  earlier: 'それ以前',
};

/**
 * グループ化された履歴アイテム
 */
export interface GroupedHistoryItem<T> {
  key: DateGroupKey;
  label: string;
  items: T[];
}

/**
 * 日付文字列を持つアイテムの型制約
 */
interface HasViewedAt {
  viewedAt: string | null;
}

/**
 * 日付グルーピングのオプション
 */
export interface DateGroupingOptions {
  /** 基準日時（デフォルト: 現在日時） */
  now?: Date;
  /** 週の開始曜日（0=日曜、1=月曜、デフォルト: 1） */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * 閲覧履歴を日付でグループ分けする
 *
 * @param views - 閲覧履歴アイテムの配列（viewedAtプロパティを持つ）
 * @param options - グルーピングオプション
 * @returns グループ化された履歴アイテムの配列（今日→昨日→今週→それ以前の順）
 *
 * @example
 * ```ts
 * const views = [
 *   { viewedAt: '2025-12-14T10:00:00Z', article: { ... } },
 *   { viewedAt: '2025-12-13T15:00:00Z', article: { ... } },
 * ];
 * const grouped = groupHistoryByDate(views);
 * // [
 * //   { key: 'today', label: '今日', items: [...] },
 * //   { key: 'yesterday', label: '昨日', items: [...] },
 * // ]
 * ```
 */
export function groupHistoryByDate<T extends HasViewedAt>(
  views: T[],
  options: DateGroupingOptions = {}
): GroupedHistoryItem<T>[] {
  const {
    now = new Date(),
    weekStartsOn = 1,
  } = options;

  // グループ初期化
  const groups: Record<DateGroupKey, T[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  // 各アイテムをグループ分け（ブラウザのローカルタイムゾーンを使用）
  // viewedAtがnullのアイテムはスキップ
  for (const view of views) {
    if (view.viewedAt === null) continue;
    const viewedDate = parseISO(view.viewedAt);
    const groupKey = getDateGroupKey(viewedDate, now, weekStartsOn);
    groups[groupKey].push(view);
  }

  // 各グループ内をviewedAt降順でソート
  // パフォーマンス改善: 事前にタイムスタンプをキャッシュして比較
  const timestampCache = new Map<T, number>();
  const getTimestamp = (item: T): number => {
    let ts = timestampCache.get(item);
    if (ts === undefined) {
      // null check済み（グループ分け時にnullをスキップ）
      ts = new Date(item.viewedAt!).getTime();
      timestampCache.set(item, ts);
    }
    return ts;
  };

  const sortByViewedAtDesc = (a: T, b: T) =>
    getTimestamp(b) - getTimestamp(a);

  for (const key of Object.keys(groups) as DateGroupKey[]) {
    groups[key].sort(sortByViewedAtDesc);
  }

  // 空でないグループのみを順序通りに返す
  const orderedKeys: DateGroupKey[] = ['today', 'yesterday', 'thisWeek', 'earlier'];
  const result: GroupedHistoryItem<T>[] = [];

  for (const key of orderedKeys) {
    if (groups[key].length > 0) {
      result.push({
        key,
        label: DATE_GROUP_LABELS[key],
        items: groups[key],
      });
    }
  }

  return result;
}

/**
 * 日付がどのグループに属するかを判定する
 *
 * @param date - 判定対象の日付
 * @param now - 基準日時
 * @param weekStartsOn - 週の開始曜日
 * @returns グループキー
 */
function getDateGroupKey(
  date: Date,
  now: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
): DateGroupKey {
  // isSameDay を使用して now パラメータを正しく参照
  if (isSameDay(date, now)) {
    return 'today';
  }

  // differenceInCalendarDays を使用して now パラメータを正しく参照
  if (differenceInCalendarDays(now, date) === 1) {
    return 'yesterday';
  }

  // 今日と昨日を除いた「今週」の判定
  // isSameWeek を使用して now パラメータを正しく参照
  if (isSameWeek(date, now, { weekStartsOn })) {
    return 'thisWeek';
  }

  return 'earlier';
}

/**
 * 日付グループのID生成（アクセシビリティ用）
 *
 * @param key - グループキー
 * @returns h2要素のid属性値
 */
export function getDateGroupHeadingId(key: DateGroupKey): string {
  return `history-group-${key}-heading`;
}
