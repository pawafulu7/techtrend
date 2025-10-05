import {
  QualityChecker,
  QualityCheckResult,
  QualityIssue,
  ContentAnalysis,
  SpeculativeExpressionResult,
} from './quality-checker.interface';

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

    const contentLength = contentAnalysis?.totalLength || contentAnalysis?.contentLength || 0;

    const absoluteMinSummaryLength = contentAnalysis?.isThinContent ? 40 : 50;
    const minSummaryLength = contentAnalysis?.isThinContent
      ? contentAnalysis.recommendedMinLength || 60
      : 50;
    const maxSummaryLength = contentAnalysis?.isThinContent
      ? contentAnalysis.recommendedMaxLength || 100
      : 200;
    const idealMinSummaryLength = contentAnalysis?.isThinContent ? 60 : 100;
    const idealMaxSummaryLength = contentAnalysis?.isThinContent ? 100 : 180;

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
        message: `一覧要約が短め: ${summaryLength}文字（理想は${idealMinSummaryLength}-${idealMaxSummaryLength}文字）`,
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
        minDetailedLength = 1200;
        idealMinDetailedLength = 1200;
        maxDetailedLength = 1500;
      } else if (contentLength >= 5000) {
        minDetailedLength = 900;
        idealMinDetailedLength = 900;
        maxDetailedLength = 1500;
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

    // 薄いコンテンツで詳細要約が元記事の2倍を超える場合はcritical
    if (contentAnalysis?.isThinContent === true && detailedLength > contentLength * 2) {
      issues.push({
        type: 'length',
        severity: 'critical',
        message: `薄いコンテンツで詳細要約が長すぎる: ${detailedLength}文字（元記事${contentLength}文字の${Math.round(detailedLength / contentLength)}倍）`,
      });
      score = 0; // 自動Fail
    }

    if (detailedLength < minDetailedLength) {
      issues.push({
        type: 'length',
        severity: 'major',
        message: `詳細要約が短すぎる: ${detailedLength}文字（最小${minDetailedLength}文字）`,
      });
      score -= 10;
    } else if (detailedLength < idealMinDetailedLength) {
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

    const itemCount = (detailedSummary.match(/・/g) || []).length;

    let minItems = 3;
    let recommendedItems = '3-4';

    if (contentLength >= 10000) {
      minItems = 7;
      recommendedItems = '8-9';
    } else if (contentLength >= 5000) {
      minItems = 5;
      recommendedItems = '5-7';
    } else if (contentLength >= 3000) {
      minItems = 4;
      recommendedItems = '4-5';
    }

    if (!contentAnalysis?.isThinContent && contentLength >= 3000) {
      if (itemCount < minItems) {
        issues.push({
          type: 'itemCount',
          severity: 'critical',
          message: `項目数不足: ${itemCount}個（最低${minItems}個必要、推奨${recommendedItems}個）`,
        });
        score -= 30;
      } else if (contentLength >= 10000 && itemCount < 8) {
        issues.push({
          type: 'itemCount',
          severity: 'minor',
          message: `項目数が推奨値未満: ${itemCount}個（推奨${recommendedItems}個）`,
        });
        score -= 10;
      }
    }

    if (!contentAnalysis?.isThinContent) {
      const bulletPoints = (detailedSummary.match(/・/g) || []).length;
      if (bulletPoints === 0) {
        issues.push({
          type: 'format',
          severity: 'major',
          message: '詳細要約に箇条書き（・）が含まれていない',
        });
        score -= 15;
      } else if (bulletPoints < 3 && contentLength < 3000) {
        issues.push({
          type: 'format',
          severity: 'minor',
          message: `詳細要約の項目数が少ない: ${bulletPoints}項目（理想は3-5項目）`,
        });
        score -= 5;
      }
    }

    const summarySpeculative = this.detectSpeculativeExpressions(summary);
    const detailedSpeculative = this.detectSpeculativeExpressions(detailedSummary);
    const speculativeResult = {
      count: summarySpeculative.count + detailedSpeculative.count,
      ratio: Math.max(summarySpeculative.ratio, detailedSpeculative.ratio),
      expressions: [...summarySpeculative.expressions, ...detailedSpeculative.expressions],
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
        const compareLength = Math.min(summary.length, detailedSummary.length, 100);
        if (
          compareLength >= 30 &&
          summary.substring(0, compareLength) === detailedSummary.substring(0, compareLength)
        ) {
          issues.push({
            type: 'duplicate',
            severity: 'major',
            message: `一覧要約と詳細要約の最初の${compareLength}文字が同一`,
          });
          score -= 30;
        }
      }

      if (!contentAnalysis?.isThinContent && !detailedSummary.includes('・')) {
        issues.push({
          type: 'format',
          severity: 'major',
          message: '詳細要約に箇条書き形式がない',
        });
        score -= 20;
      }
    }

    score = Math.max(0, score);

    const minQualityScore = parseInt(process.env.QUALITY_MIN_SCORE || '70');
    const requiresRegeneration =
      score < minQualityScore ||
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
      const speculativePenalty = baseCheck.speculativeExpressions.count * speculativeWeight;
      score = Math.max(0, score - speculativePenalty);
    }

    return score;
  }

  private detectSpeculativeExpressions(text: string): SpeculativeExpressionResult {
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