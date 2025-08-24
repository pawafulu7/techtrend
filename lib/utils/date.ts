export function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return `${diffSec}秒前`;
  } else if (diffMin < 60) {
    return `${diffMin}分前`;
  } else if (diffHour < 24) {
    return `${diffHour}時間前`;
  } else if (diffDay < 7) {
    return `${diffDay}日前`;
  } else {
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}

export function formatDateWithTime(date: Date | string): string {
  const d = new Date(date);
  
  // 日本時間（JST）で表示
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

export function parseRSSDate(dateString: string): Date {
  // 様々な日付形式を試す
  const date = new Date(dateString);
  
  // 無効な日付の場合
  if (isNaN(date.getTime())) {
    // 現在時刻を返す
    return new Date();
  }
  
  // 未来の日付チェック（1年以上先）
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (date > oneYearFromNow) {
    return new Date();
  }
  
  // 異常に大きな値のチェック（例：1753888851754）
  if (date.getTime() > 9999999999999) {
    return new Date();
  }
  
  return date;
}

/**
 * 記事の公開日時を調整する関数
 * タイムゾーンの問題により未来の日付になっている場合、現在時刻に調整する
 * これにより、createdAt < publishedAtという論理的矛盾を防ぐ
 * 
 * @param publishedAt - 記事の公開日時
 * @param sourceName - ソース名（将来的な拡張用、現在は未使用）
 * @returns 調整後の公開日時
 */
export function adjustTimezoneForArticle(
  publishedAt: Date,
  sourceName?: string
): Date {
  const now = new Date();
  
  // 未来日付の調整
  if (publishedAt > now) {
    return now;
  }
  
  // 将来的にソース別の調整を追加する場合のプレースホルダー
  // 例：
  // if (sourceName === 'Google Developers Blog') {
  //   // PST/PDT（太平洋時間）の調整
  //   // 必要に応じて実装
  // }
  // if (sourceName === 'Stack Overflow Blog') {
  //   // EST/EDT（東部時間）の調整
  //   // 必要に応じて実装
  // }
  
  return publishedAt;
}