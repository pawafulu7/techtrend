import {
  QualityChecker,
  QualityCheckResult,
  QualityIssue,
  ContentAnalysis,
  SpeculativeExpressionResult,
} from './quality-checker.interface';
import {
  SUMMARY_LENGTH,
  THIN_SUMMARY_LENGTH,
  getItemCountRule,
} from '../constants';
import { config } from '@/lib/config/env';

const SPECULATIVE_PATTERNS = [
  'と考えられます',
  'と考えられる',
  'と推測されます',
  'と推測される',
  'かもしれません',
  'かもしれない',
  'と思われます',
  'と思われる',
  'ようです',
  'でしょう',
  'だろう',
  '可能性が高い',
  '可能性があります',
  '予想されます',
  '予想される',
  'おそらく',
  '恐らく',
  'たぶん',
  '多分',
];

export class SummaryQualityChecker implements QualityChecker {
  checkQuality(
    summary: string,
    detailedSummary: string,
    contentAnalysis?: ContentAnalysis
  ): QualityCheckResult {
    const issues: QualityIssue[] = [];
    let score = 100;

    const contentLength =
      contentAnalysis?.totalLength || contentAnalysis?.contentLength || 0;
    // contentLengthが提供されているかどうか（0は未提供を意味する）
    const hasContentLength = contentLength > 0;
    // 短文判定: contentLengthが提供されている場合のみ短文とみなす（未提供時は通常コンテンツ扱い）
    const isShortContent = hasContentLength && contentLength < 400;

    // 通常コンテンツの閾値は constants.ts の SUMMARY_LENGTH を唯一の出典とする。
    // プロンプト側（prompt-builder.ts / article-type-prompts.ts）も同じ定数を参照する。
    const absoluteMinSummaryLength = contentAnalysis?.isThinContent
      ? THIN_SUMMARY_LENGTH.absoluteMin
      : SUMMARY_LENGTH.absoluteMin;
    const minSummaryLength = contentAnalysis?.isThinContent
      ? contentAnalysis.recommendedMinLength || THIN_SUMMARY_LENGTH.idealMin
      : SUMMARY_LENGTH.absoluteMin;
    const maxSummaryLength = contentAnalysis?.isThinContent
      ? contentAnalysis.recommendedMaxLength || THIN_SUMMARY_LENGTH.hardMax
      : SUMMARY_LENGTH.hardMax;
    // 減点しきい値には penaltyMin を使う。
    // プロンプトの目標帯(targetMin=150)を減点の下限に流用すると、
    // 目標をわずかに下回っただけの出力まで一律で減点される。
    const idealMinSummaryLength = contentAnalysis?.isThinContent
      ? THIN_SUMMARY_LENGTH.idealMin
      : SUMMARY_LENGTH.penaltyMin;
    // メッセージ表示用の目標帯（減点判定には使わない）
    const targetMinSummaryLength = contentAnalysis?.isThinContent
      ? THIN_SUMMARY_LENGTH.idealMin
      : SUMMARY_LENGTH.targetMin;
    const targetMaxSummaryLength = contentAnalysis?.isThinContent
      ? THIN_SUMMARY_LENGTH.idealMax
      : SUMMARY_LENGTH.targetMax;

    const summaryLength = summary.length;
    if (summaryLength < absoluteMinSummaryLength) {
      issues.push({
        type: 'length',
        severity: 'major',
        message: `一覧要約が短すぎる: ${summaryLength}文字（最小${absoluteMinSummaryLength}文字）`,
      });
      score -= 20;
    } else if (summaryLength < minSummaryLength) {
      issues.push({
        type: 'length',
        severity: 'minor',
        message: `一覧要約が短め: ${summaryLength}文字（推奨${minSummaryLength}文字以上）`,
      });
      score -= 5;
    } else if (summaryLength < idealMinSummaryLength) {
      issues.push({
        type: 'length',
        severity: 'minor',
        message: `一覧要約が短め: ${summaryLength}文字（目標は${targetMinSummaryLength}-${targetMaxSummaryLength}文字）`,
      });
      score -= 5;
    } else if (summaryLength > maxSummaryLength) {
      issues.push({
        type: 'length',
        severity: contentAnalysis?.isThinContent ? 'major' : 'minor',
        message: `一覧要約が長すぎる: ${summaryLength}文字（最大${maxSummaryLength}文字）`,
      });
      score -= contentAnalysis?.isThinContent ? 15 : 10;
    }

    const detailedLength = detailedSummary.length;

    let minDetailedLength = 80;
    let idealMinDetailedLength = 120;
    let maxDetailedLength = 800;

    if (contentAnalysis?.isThinContent) {
      minDetailedLength = 50;
      idealMinDetailedLength = 80;
      maxDetailedLength = 200;
    } else {
      if (contentLength >= 10000) {
        minDetailedLength = 900;
        idealMinDetailedLength = 1000;
        maxDetailedLength = 1500;
      } else if (contentLength >= 5000) {
        minDetailedLength = 600;
        idealMinDetailedLength = 700;
        maxDetailedLength = 1200;
      } else if (contentLength >= 3000) {
        minDetailedLength = 600;
        idealMinDetailedLength = 600;
        maxDetailedLength = 1000;
      } else if (contentLength >= 1000) {
        minDetailedLength = 400;
        idealMinDetailedLength = 400;
        maxDetailedLength = 700;
      }
    }

    // 短文（<400字）で詳細要約が元記事の1.5倍を超える場合はcritical
    // isThinContent閾値が400に統一されたため、isThinContent===true && !isShortContentは発生しない
    if (isShortContent && detailedLength > contentLength * 1.5) {
      const ratio = Math.round((detailedLength / contentLength) * 10) / 10;
      issues.push({
        type: 'length',
        severity: 'critical',
        message: `短文で詳細要約が長すぎる: ${detailedLength}文字（元記事${contentLength}文字の${ratio}倍、上限は1.5倍）`,
      });
      score = 0; // 自動Fail
    }

    // 箇条書きカウント（複数箇所で使用）
    const bulletCount = (detailedSummary.match(/・/g) || []).length;

    // 短文（<400字）で箇条書きがある場合は不適切
    if (isShortContent && bulletCount > 0) {
      issues.push({
        type: 'format',
        severity: 'major',
        message: `短文（${contentLength}字）に箇条書き（${bulletCount}項目）は不適切。平文1-2文で要約すべき`,
      });
      score -= 20;
    }

    // Short content (<400 chars) with empty detailedSummary is expected (prompt instructs empty array)
    const skipDetailedLengthCheck = isShortContent && detailedLength === 0;

    if (!skipDetailedLengthCheck && detailedLength < minDetailedLength) {
      // Strict bins (contentLength >= 5000) have "strict requirement" in prompt
      const isStrictBin = hasContentLength && contentLength >= 5000;
      const severity = isStrictBin ? 'critical' : 'major';

      issues.push({
        type: 'length',
        severity,
        message: `詳細要約が短すぎる: ${detailedLength}文字（最小${minDetailedLength}文字）`,
      });

      if (isStrictBin) {
        score = 0; // Critical violation: automatic fail
      } else {
        score -= 10;
      }
    } else if (
      !skipDetailedLengthCheck &&
      detailedLength < idealMinDetailedLength
    ) {
      issues.push({
        type: 'length',
        severity: 'minor',
        message: `詳細要約が短め: ${detailedLength}文字（理想は${idealMinDetailedLength}-${maxDetailedLength}文字）`,
      });
      score -= 3;
    } else if (detailedLength > maxDetailedLength) {
      issues.push({
        type: 'length',
        severity: 'minor',
        message: `詳細要約が長すぎる: ${detailedLength}文字（最大${maxDetailedLength}文字）`,
      });
      score -= 5;
    }

    if (!summary.endsWith('。')) {
      issues.push({
        type: 'punctuation',
        severity: 'minor',
        message: '一覧要約が句点で終わっていない',
      });
      score -= 5;
    }

    // bulletCountを再利用（上部で計算済み）
    const itemCount = bulletCount;

    // 共通定数から項目数ルールを取得（prompt-builder.tsと同期）
    const itemCountRule = getItemCountRule(contentLength);
    const minItems = itemCountRule.minItems;
    const maxItems = itemCountRule.maxItems;
    const recommendedItems = itemCountRule.recommendedItems;

    if (!contentAnalysis?.isThinContent && contentLength >= 3000) {
      if (itemCount < minItems) {
        issues.push({
          type: 'itemCount',
          severity: 'critical',
          message: `項目数不足: ${itemCount}個（最低${minItems}個必要、推奨${recommendedItems}個）`,
        });
        score -= 30;
      }
      // 旧実装は contentLength >= 10000 のとき itemCount < 8 を minor 減点していたが、
      // 共通ルールの推奨下限は 7 のため、プロンプト指示どおりの7項目が減点されていた。
      // 不足判定は上の minItems 判定に一本化する。
    }

    // 項目数上限チェック（contentLength提供時のみ、短文以外）
    if (
      hasContentLength &&
      !contentAnalysis?.isThinContent &&
      !isShortContent &&
      bulletCount > maxItems
    ) {
      issues.push({
        type: 'itemCount',
        severity: 'major',
        message: `項目数超過: ${bulletCount}個（上限${maxItems}個）`,
      });
      score -= 15;
    }

    // 短文（<400字）は箇条書き不要なので除外（contentLength未提供時は箇条書き必須）
    if (!contentAnalysis?.isThinContent && !isShortContent) {
      if (bulletCount === 0) {
        issues.push({
          type: 'format',
          severity: 'major',
          message: '詳細要約に箇条書き（・）が含まれていない',
        });
        score -= 15;
      } else if (bulletCount < minItems && contentLength < 3000) {
        // 旧実装は固定値 3 と比較していたため、共通ルールが 2-3 項目を推奨する
        // 400-999文字の記事で、指示どおりの2項目が減点されていた。
        issues.push({
          type: 'format',
          severity: 'minor',
          message: `詳細要約の項目数が少ない: ${bulletCount}項目（推奨${recommendedItems}項目）`,
        });
        score -= 5;
      }
    }

    const summarySpeculative = this.detectSpeculativeExpressions(summary);
    const detailedSpeculative =
      this.detectSpeculativeExpressions(detailedSummary);
    const speculativeResult = {
      count: summarySpeculative.count + detailedSpeculative.count,
      ratio: Math.max(summarySpeculative.ratio, detailedSpeculative.ratio),
      expressions: [
        ...summarySpeculative.expressions,
        ...detailedSpeculative.expressions,
      ],
    };

    if (contentAnalysis?.isThinContent && speculativeResult.count > 0) {
      issues.push({
        type: 'speculative',
        severity: 'critical',
        message: `推測表現は厳禁: ${speculativeResult.count}個（${speculativeResult.expressions.join('、')}）`,
      });
      score -= 50;
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

    if (summary && detailedSummary) {
      if (summary === detailedSummary) {
        issues.push({
          type: 'duplicate',
          severity: 'critical',
          message: '一覧要約と詳細要約が完全に同一',
        });
        score = 0;
      } else {
        const compareLength = Math.min(
          summary.length,
          detailedSummary.length,
          100
        );
        if (
          compareLength >= 30 &&
          summary.substring(0, compareLength) ===
            detailedSummary.substring(0, compareLength)
        ) {
          issues.push({
            type: 'duplicate',
            severity: 'major',
            message: `一覧要約と詳細要約の最初の${compareLength}文字が同一`,
          });
          score -= 30;
        }
      }
    }

    score = Math.max(0, score);

    // NOTE: requiresRegeneration is computed but not used by any caller.
    // UnifiedSummaryService uses qualityResult.score for retry decisions.
    // Kept for interface compatibility; consider removing in future cleanup.
    const minQualityScore = config.quality.minScore();
    const requiresRegeneration =
      score <= minQualityScore ||
      issues.some((issue) => issue.severity === 'critical') ||
      (contentLength >= 5000 && itemCount < minItems);

    const hasCriticalIssues = issues.some(
      (issue) => issue.severity === 'critical' || issue.severity === 'major'
    );
    let isValid = score >= 60 && !hasCriticalIssues;
    if (contentAnalysis?.isThinContent) {
      if (summaryLength < absoluteMinSummaryLength) {
        isValid = false;
      }
    }

    return {
      isValid,
      issues,
      requiresRegeneration,
      score,
      speculativeExpressions: speculativeResult,
      itemCount,
      itemCountValid: itemCount >= minItems,
    };
  }

  calculateScore(
    summary: string,
    detailedSummary: string,
    speculativeWeight: number = 2.0
  ): number {
    const baseCheck = this.checkQuality(summary, detailedSummary);
    let score = baseCheck.score;

    if (baseCheck.speculativeExpressions) {
      const speculativePenalty =
        baseCheck.speculativeExpressions.count * speculativeWeight;
      score = Math.max(0, score - speculativePenalty);
    }

    return score;
  }

  private detectSpeculativeExpressions(
    text: string
  ): SpeculativeExpressionResult {
    if (!text) {
      return { count: 0, ratio: 0, expressions: [] };
    }

    const expressions: string[] = [];
    let totalCount = 0;

    for (const pattern of SPECULATIVE_PATTERNS) {
      const regex = new RegExp(pattern, 'g');
      const matches = text.match(regex);
      if (matches) {
        totalCount += matches.length;
        matches.forEach((match) => {
          if (!expressions.includes(match)) {
            expressions.push(match);
          }
        });
      }
    }

    const sentenceCount = (text.match(/。/g) || []).length || 1;
    const ratio = sentenceCount > 0 ? totalCount / sentenceCount : 0;

    return {
      count: totalCount,
      ratio: Math.round(ratio * 100) / 100,
      expressions,
    };
  }
}
