/**
 * 要約品質チェック機能
 * 統一プロンプトによる要約生成の品質を検証し、再生成の必要性を判定
 */

import { detectSpeculativeExpressions } from './quality-rules';
import type {
  QualityCheckResult,
  QualityIssue,
  ContentAnalysis,
} from './quality-types';

// Re-export types for backward compatibility
export type {
  QualityCheckResult,
  QualityIssue,
  ContentAnalysis,
  SpeculativeExpressionResult,
} from './quality-types';

/**
 * 品質スコアの最小値を取得
 */
export function getMinQualityScore(): number {
  const value = parseInt(process.env.QUALITY_MIN_SCORE || '70');
  return isNaN(value) ? 70 : value;
}

/**
 * 要約の品質をチェック
 * @param summary 一覧要約
 * @param detailedSummary 詳細要約
 * @returns 品質チェック結果
 */
export function checkSummaryQuality(
  summary: string,
  detailedSummary: string,
  contentAnalysis?: ContentAnalysis // オプショナル引数として追加
): QualityCheckResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  // コンテンツ長に基づく項目数要件を追加
  const contentLength =
    contentAnalysis?.totalLength ?? contentAnalysis?.contentLength ?? 0;

  // 動的な基準設定（contentAnalysisがある場合はそれを使用）
  const minSummaryLength = contentAnalysis?.isThinContent
    ? contentAnalysis.recommendedMinLength || 60
    : 50;
  const maxSummaryLength = contentAnalysis?.isThinContent
    ? contentAnalysis.recommendedMaxLength || 100
    : 200;
  const idealMinSummaryLength = contentAnalysis?.isThinContent ? 60 : 100;
  const idealMaxSummaryLength = contentAnalysis?.isThinContent ? 100 : 180;

  // 1. 一覧要約の文字数チェック
  const summaryLength = summary.length;
  if (summaryLength < minSummaryLength) {
    // 最小文字数未満は短すぎる
    issues.push({
      type: 'length',
      severity: 'major',
      message: `一覧要約が短すぎる: ${summaryLength}文字（最小${minSummaryLength}文字）`,
    });
    score -= 20;
  } else if (summaryLength < idealMinSummaryLength) {
    // 理想の最小値未満は短め
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `一覧要約が短め: ${summaryLength}文字（理想は${idealMinSummaryLength}-${idealMaxSummaryLength}文字）`,
    });
    score -= 5;
  } else if (summaryLength > maxSummaryLength) {
    // 最大文字数を超える場合は長すぎる
    issues.push({
      type: 'length',
      severity: contentAnalysis?.isThinContent ? 'major' : 'minor',
      message: `一覧要約が長すぎる: ${summaryLength}文字（最大${maxSummaryLength}文字）`,
    });
    score -= contentAnalysis?.isThinContent ? 15 : 10;
  }

  // 2. 詳細要約の文字数チェック（コンテンツ長に応じた可変レンジ）
  const detailedLength = detailedSummary.length;

  // コンテンツ長に応じた動的なレンジ設定
  // contentLengthは既に上で定義済みなので再利用
  let minDetailedLength = 200;
  let idealMinDetailedLength = 400;
  let maxDetailedLength = 800;

  if (contentAnalysis?.isThinContent) {
    // 薄いコンテンツの場合（<400文字、呼び出し元で判定）
    minDetailedLength = 50;
    idealMinDetailedLength = 80;
    maxDetailedLength = 200;
  } else {
    // contentLengthに応じた可変レンジ
    if (contentLength >= 10000) {
      // 10000文字以上：プロンプトは1200-1500文字を要求
      minDetailedLength = 1200;
      idealMinDetailedLength = 1200;
      maxDetailedLength = 1500;
    } else if (contentLength >= 5000) {
      // 5000文字以上：プロンプトは900-1500文字を要求
      minDetailedLength = 900;
      idealMinDetailedLength = 900;
      maxDetailedLength = 1500;
    } else if (contentLength >= 3000) {
      // 3000-5000文字：600-1000文字
      minDetailedLength = 600;
      idealMinDetailedLength = 600;
      maxDetailedLength = 1000;
    } else if (contentLength >= 1000) {
      // 1000-3000文字：400-700文字
      minDetailedLength = 400;
      idealMinDetailedLength = 400;
      maxDetailedLength = 700;
    }
  }

  // 薄いコンテンツで詳細要約が元記事の2倍を超える場合はcritical
  if (
    contentAnalysis?.isThinContent === true &&
    contentLength > 0 &&
    detailedLength > contentLength * 2
  ) {
    issues.push({
      type: 'length',
      severity: 'critical',
      message: `薄いコンテンツで詳細要約が長すぎる: ${detailedLength}文字（元記事${contentLength}文字の${Math.round(detailedLength / contentLength)}倍）`,
    });
    score = 0; // 自動Fail
  }

  // 詳細要約の長さチェック
  if (detailedLength < minDetailedLength) {
    issues.push({
      type: 'length',
      severity: 'major',
      message: `詳細要約が短すぎる: ${detailedLength}文字（最小${minDetailedLength}文字）`,
    });
    score -= 20;
  } else if (detailedLength < idealMinDetailedLength) {
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `詳細要約が短め: ${detailedLength}文字（理想は${idealMinDetailedLength}-${maxDetailedLength}文字）`,
    });
    score -= 5;
  } else if (detailedLength > maxDetailedLength) {
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `詳細要約が長すぎる: ${detailedLength}文字（最大${maxDetailedLength}文字）`,
    });
    score -= 10;
  }

  // 3. 句点チェック
  if (!summary.endsWith('。')) {
    issues.push({
      type: 'punctuation',
      severity: 'minor',
      message: '一覧要約が句点で終わっていない',
    });
    score -= 5;
  }

  // ★★★ 重要な追加: 項目数チェック ★★★
  const itemCount = (detailedSummary.match(/^・/gm) || []).length;

  // コンテンツ長に応じた最低項目数の決定
  let minItems = 3; // デフォルト
  let recommendedItems = '3-4'; // デフォルト推奨

  if (contentLength >= 10000) {
    minItems = 7; // プロンプトと統一（最低7項目）
    recommendedItems = '8-9'; // プロンプトと統一（推奨8-9項目）
  } else if (contentLength >= 5000) {
    minItems = 5;
    recommendedItems = '5-7';
  } else if (contentLength >= 3000) {
    minItems = 4;
    recommendedItems = '4-5';
  }

  // 項目数が不足している場合のチェック
  if (!contentAnalysis?.isThinContent && contentLength >= 3000) {
    if (itemCount < minItems) {
      issues.push({
        type: 'itemCount',
        severity: 'critical',
        message: `項目数不足: ${itemCount}個（最低${minItems}個必要、推奨${recommendedItems}個）`,
      });
      score -= 30; // 大幅減点
    } else if (contentLength >= 10000 && itemCount < 8) {
      // 超長文記事で推奨値未満の場合
      issues.push({
        type: 'itemCount',
        severity: 'minor',
        message: `項目数が推奨値未満: ${itemCount}個（推奨${recommendedItems}個）`,
      });
      score -= 10;
    }
  }

  // 4. 詳細要約の形式チェック（薄いコンテンツの場合は箇条書きを必須としない）
  if (!contentAnalysis?.isThinContent) {
    if (itemCount === 0) {
      issues.push({
        type: 'format',
        severity: 'major',
        message: '詳細要約に箇条書き（・）が含まれていない',
      });
      score -= 15;
    } else if (itemCount < 3 && contentLength < 3000) {
      // 短い記事の場合のみ項目数チェック
      issues.push({
        type: 'format',
        severity: 'minor',
        message: `詳細要約の項目数が少ない: ${itemCount}項目（理想は3-5項目）`,
      });
      score -= 5;
    }
  }

  // 5. 推測表現のチェック（薄いコンテンツでは厳格にチェック）
  // 一覧要約と詳細要約の両方をチェック
  const summarySpeculative = detectSpeculativeExpressions(summary);
  const detailedSpeculative = detectSpeculativeExpressions(detailedSummary);
  const speculativeResult = {
    count: summarySpeculative.count + detailedSpeculative.count,
    ratio: Math.max(summarySpeculative.ratio, detailedSpeculative.ratio),
    expressions: [
      ...new Set([
        ...summarySpeculative.expressions,
        ...detailedSpeculative.expressions,
      ]),
    ],
  };

  if (contentAnalysis?.isThinContent && speculativeResult.count > 0) {
    // 薄いコンテンツでは推測表現は厳禁
    issues.push({
      type: 'speculative',
      severity: 'critical',
      message: `推測表現は厳禁: ${speculativeResult.count}個（${speculativeResult.expressions.join('、')}）`,
    });
    score -= 50; // 大幅減点
  } else if (speculativeResult.count >= 3) {
    issues.push({
      type: 'speculative',
      severity: 'major',
      message: `推測表現が多すぎる: ${speculativeResult.count}個（${speculativeResult.expressions.join('、')}）`,
    });
    score -= 20;
  } else if (speculativeResult.count >= 2) {
    issues.push({
      type: 'speculative',
      severity: 'minor',
      message: `推測表現が含まれている: ${speculativeResult.count}個`,
    });
    score -= 10;
  }

  // 6. 空の項目チェック
  const lines = detailedSummary.split('\n');
  const emptyBullets = lines.filter((line) => line.trim() === '・').length;
  if (emptyBullets > 0) {
    issues.push({
      type: 'format',
      severity: 'critical',
      message: `空の箇条書き項目がある: ${emptyBullets}個`,
    });
    score -= 30;
  }

  // 7. Phase 3: 重複検出（一覧要約と詳細要約が同じ）
  if (summary && detailedSummary) {
    // 完全一致チェック
    if (summary === detailedSummary) {
      issues.push({
        type: 'duplicate',
        severity: 'critical',
        message: '一覧要約と詳細要約が完全に同一',
      });
      score = 0; // 重複の場合はスコア0
    }
    // 最初の100文字が同じかチェック
    else if (
      summary.substring(0, 100) === detailedSummary.substring(0, 100) &&
      summary.length >= 100
    ) {
      issues.push({
        type: 'duplicate',
        severity: 'major',
        message: '一覧要約と詳細要約の最初の100文字が同一',
      });
      score -= 30;
    }
    // Note: 箇条書きチェックはセクション4で実施済み（itemCount使用）
  }

  // スコアの調整
  score = Math.max(0, score);

  // 再生成が必要かどうかの判定（項目数不足も含む）
  const requiresRegeneration =
    score < getMinQualityScore() ||
    issues.some((issue) => issue.severity === 'critical') ||
    (contentLength >= 5000 && itemCount < minItems); // 項目数不足も再生成トリガーに

  // isValidの判定: 薄いコンテンツの場合は最小文字数も厳格にチェック
  let isValid = score >= 60;
  if (contentAnalysis?.isThinContent) {
    // 薄いコンテンツの場合、最小文字数未満はinvalid
    if (summaryLength < minSummaryLength) {
      isValid = false;
    }
  }

  return {
    isValid,
    issues,
    requiresRegeneration,
    score,
    speculativeExpressions: speculativeResult,
    itemCount, // 項目数も返す
    itemCountValid: contentAnalysis?.isThinContent
      ? true
      : itemCount >= minItems,
  };
}

/**
 * 品質スコアを計算
 * 推測表現を考慮した品質スコアの計算
 */
export function calculateQualityScore(
  summary: string,
  detailedSummary: string,
  speculativeWeight: number = 2.0,
  contentAnalysis?: ContentAnalysis
): number {
  const baseCheck = checkSummaryQuality(
    summary,
    detailedSummary,
    contentAnalysis
  );
  let score = baseCheck.score;

  // 推測表現による追加ペナルティ
  if (baseCheck.speculativeExpressions) {
    const speculativePenalty =
      baseCheck.speculativeExpressions.count * speculativeWeight;
    score = Math.max(0, score - speculativePenalty);
  }

  return score;
}

// Re-export all functions from split modules for backward compatibility
export { detectSpeculativeExpressions } from './quality-rules';
export {
  calculateQualityStats,
  isQualityCheckEnabled,
  getMaxRegenerationAttempts,
  generateQualityReport,
  cleanupText,
  cleanupDetailedSummary,
  expandSummaryIfNeeded,
} from './quality-scorer';
