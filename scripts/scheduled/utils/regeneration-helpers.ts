/**
 * 再生成スクリプト共通ユーティリティ
 * auto-regenerate.ts / auto-regenerate-low-quality.ts / regenerate-summaries.ts で共有
 */

export interface RegenerationStats {
  success: number;
  failed: number;
  skipped?: number;
}

/**
 * 再生成結果のフォーマット済みログ出力
 * 出力先は console.error に統一（スケジューラーログとして stderr を使用）
 */
export function reportResults(label: string, stats: RegenerationStats): void {
  console.error(`\n===== ${label} =====`);
  console.error(`成功: ${stats.success}件`);
  console.error(`失敗: ${stats.failed}件`);
  if (stats.skipped !== undefined) {
    console.error(`スキップ: ${stats.skipped}件`);
  }
}

/**
 * APIレート制限対策の待機ユーティリティ
 */
export function rateLimitDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
