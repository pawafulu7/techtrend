/**
 * 再生成スクリプト共通ユーティリティ
 * auto-regenerate.ts / auto-regenerate-low-quality.ts / regenerate-summaries.ts で共有
 */

export interface RegenerationStats {
  total?: number;
  success: number;
  failed: number;
  skipped?: number;
}

/**
 * 再生成結果のフォーマット済みログ出力
 * 出力先は console.error に統一（スケジューラーログとして stderr を使用）
 */
export function reportResults(label: string, stats: RegenerationStats): void {
  const lines = [`\n===== ${label} =====`];
  if (stats.total !== undefined) {
    lines.push(`処理件数: ${stats.total}件`);
  }
  lines.push(`成功: ${stats.success}件`);
  lines.push(`失敗: ${stats.failed}件`);
  if (stats.skipped !== undefined) {
    lines.push(`スキップ: ${stats.skipped}件`);
  }
  console.error(lines.join('\n'));
}

/**
 * APIレート制限対策の待機ユーティリティ
 */
export function rateLimitDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
