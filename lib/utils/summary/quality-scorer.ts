/**
 * 要約品質スコアリング機能
 * 統計情報の計算、レポート生成、テキストクリーンアップ、設定取得
 */

import type { QualityCheckResult } from './quality-types';

/**
 * 品質チェック結果の統計情報を計算
 */
export function calculateQualityStats(results: QualityCheckResult[]): {
  totalCount: number;
  validCount: number;
  invalidCount: number;
  requiresRegenerationCount: number;
  averageScore: number;
  issuesSummary: Record<string, number>;
  regenerationRate: number;
  minorIssuesCount: number;
  majorIssuesCount: number;
  criticalIssuesCount: number;
} {
  // 統計情報を計算
  const totalCount = results.length;

  if (totalCount === 0) {
    return {
      totalCount: 0,
      validCount: 0,
      invalidCount: 0,
      requiresRegenerationCount: 0,
      averageScore: 0,
      issuesSummary: {},
      regenerationRate: 0,
      minorIssuesCount: 0,
      majorIssuesCount: 0,
      criticalIssuesCount: 0,
    };
  }

  const validCount = results.filter((r) => r.isValid).length;
  const invalidCount = totalCount - validCount;
  const requiresRegenerationCount = results.filter(
    (r) => r.requiresRegeneration
  ).length;
  const averageScore =
    results.reduce((sum, r) => sum + r.score, 0) / totalCount;
  const regenerationRate = Math.round(
    (requiresRegenerationCount / totalCount) * 100
  );

  // issueタイプごとの集計
  const issuesSummary: Record<string, number> = {};
  let minorIssuesCount = 0;
  let majorIssuesCount = 0;
  let criticalIssuesCount = 0;

  results.forEach((result) => {
    result.issues.forEach((issue) => {
      issuesSummary[issue.type] = (issuesSummary[issue.type] || 0) + 1;

      switch (issue.severity) {
        case 'minor':
          minorIssuesCount++;
          break;
        case 'major':
          majorIssuesCount++;
          break;
        case 'critical':
          criticalIssuesCount++;
          break;
      }
    });
  });

  return {
    totalCount,
    validCount,
    invalidCount,
    requiresRegenerationCount,
    averageScore,
    issuesSummary,
    regenerationRate,
    minorIssuesCount,
    majorIssuesCount,
    criticalIssuesCount,
  };
}

/**
 * 品質チェック機能が有効かどうかを判定
 */
export function isQualityCheckEnabled(): boolean {
  // 環境変数が設定されていない場合はデフォルトでtrue
  if (process.env.QUALITY_CHECK_ENABLED === undefined) {
    return true;
  }
  return process.env.QUALITY_CHECK_ENABLED === 'true';
}

/**
 * 最大再生成試行回数を取得
 */
export function getMaxRegenerationAttempts(): number {
  const value = parseInt(process.env.MAX_REGENERATION_ATTEMPTS || '3');
  return isNaN(value) ? 3 : value;
}

/**
 * 品質チェック結果のレポートを生成
 */
export function generateQualityReport(result: QualityCheckResult): string {
  const lines: string[] = [];

  lines.push('## 要約品質チェック結果');
  lines.push('');
  lines.push(`品質スコア: ${result.score}/100`);
  lines.push(`判定: ${result.isValid ? '✅ 合格' : '❌ 不合格'}`);
  lines.push(`再生成必要: ${result.requiresRegeneration ? 'はい' : 'いいえ'}`);

  if (result.issues.length > 0) {
    lines.push('');
    lines.push('### 問題点:');
    result.issues.forEach((issue) => {
      const icon =
        issue.severity === 'critical'
          ? '🔴'
          : issue.severity === 'major'
            ? '🟡'
            : '🔵';
      lines.push(`- ${icon} [${issue.severity}] ${issue.message}`);
    });
  } else {
    lines.push('');
    lines.push('問題点なし');
  }

  return lines.join('\n');
}

/**
 * テキストのクリーンアップ
 * 要約テキストから不要な記号や重複を除去
 */
export function cleanupText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // 連続する空白を1つに
    .replace(/。{2,}/g, '。') // 連続する句点を1つに
    .replace(/、{2,}/g, '、') // 連続する読点を1つに
    .replace(/\n{3,}/g, '\n\n') // 3つ以上の改行を2つに
    .trim();
}

/**
 * 詳細要約専用のクリーンアップ
 * 改行を保持しつつクリーンアップ
 */
export function cleanupDetailedSummary(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '・') // 空の箇条書きを除去
    .join('\n')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、');
}

/**
 * 一覧要約拡張関数（既存機能）
 * 50文字未満の要約を適切な長さに拡張
 */
export function expandSummaryIfNeeded(
  summary: string,
  title: string = '',
  minLength: number = 150,
  content: string = ''
): string {
  // すでに十分な長さがある場合はそのまま返す
  if (summary.length >= minLength) {
    return summary;
  }

  // 50文字以上あれば基本的に許容するため、そのまま返す
  if (summary.length >= 50) {
    return summary;
  }

  // 句点を一時的に削除
  let expandedSummary = summary.replace(/。$/, '');

  // タイトルを活用した自然な拡張（タイトルが含まれていない場合）
  if (
    title &&
    expandedSummary.length < 30 &&
    !expandedSummary.includes(title.substring(0, 10))
  ) {
    // expandedSummaryが空または非常に短い場合の処理を改善
    if (expandedSummary.length === 0 || expandedSummary.trim() === '') {
      expandedSummary = `${title}に関する内容`;
    } else {
      expandedSummary = `${title}について、${expandedSummary}`;
    }
  }

  // コンテンツから自然な補完を試みる（50文字を目指す）
  if (expandedSummary.length < 50 && content) {
    const cleanContent = content.replace(/[\n\r]+/g, ' ').trim();
    const shortage = 50 - expandedSummary.length;

    // コンテンツから適切な長さの文章を抽出
    if (cleanContent.length > shortage) {
      const additionalText = cleanContent.substring(0, shortage + 20);
      // 文の途中で切れないように調整
      const lastPeriodIndex = additionalText.lastIndexOf('。');
      if (lastPeriodIndex > 0) {
        // 既存の文章に句点がある場合のみ追加の句点を入れる
        if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
          expandedSummary +=
            '。' + additionalText.substring(0, lastPeriodIndex + 1);
        } else {
          expandedSummary += additionalText.substring(0, lastPeriodIndex + 1);
        }
      } else {
        // 句点がない場合は適切な位置で切る
        const cutPoint = additionalText.lastIndexOf('、');
        if (cutPoint > 0 && cutPoint > shortage / 2) {
          if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
            expandedSummary += '。' + additionalText.substring(0, cutPoint);
          } else {
            expandedSummary += additionalText.substring(0, cutPoint);
          }
        } else {
          if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
            expandedSummary += '。' + additionalText.substring(0, shortage);
          } else {
            expandedSummary += additionalText.substring(0, shortage);
          }
        }
      }
    } else if (cleanContent.length > 0) {
      if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
        expandedSummary += '。' + cleanContent;
      } else {
        expandedSummary += cleanContent;
      }
    }
  }

  // 最後に句点で終わるように調整
  if (!expandedSummary.endsWith('。')) {
    expandedSummary += '。';
  }

  // 最終チェック：30文字未満は本当に短すぎるので、タイトルとコンテンツから最小限の要約を生成
  if (expandedSummary.length < 30) {
    if (title) {
      const fallbackSummary = `${title}に関する記事${content ? '。' + content.substring(0, 50).replace(/[\n\r]+/g, ' ') : ''}。`;
      return fallbackSummary;
    }
    // タイトルもない場合は、元の要約をそのまま返す
    return expandedSummary;
  }

  return expandedSummary;
}
