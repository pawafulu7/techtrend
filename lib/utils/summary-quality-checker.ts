/**
 * 要約品質チェック機能
 * 統一プロンプトによる要約生成の品質を検証し、再生成の必要性を判定
 */

import { ContentAnalysis as BaseContentAnalysis } from './content-analyzer';

// ContentAnalysisを拡張して互換性を保つ
export interface ContentAnalysis extends BaseContentAnalysis {
  totalLength?: number;  // 追加フィールド（オプション）
}

export interface QualityCheckResult {
  isValid: boolean;
  issues: QualityIssue[];
  requiresRegeneration: boolean;
  score: number;
  speculativeExpressions?: SpeculativeExpressionResult;
  itemCount?: number;  // 項目数
  itemCountValid?: boolean;  // 項目数が基準を満たしているか
}

export interface QualityIssue {
  type: 'length' | 'format' | 'punctuation' | 'speculative' | 'duplicate' | 'itemCount';  // itemCountを追加
  severity: 'critical' | 'major' | 'minor';
  message: string;
}

export interface SpeculativeExpressionResult {
  count: number;
  ratio: number;
  expressions: string[];
}

// 推測表現のパターン
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
  'おそらく',  // 追加
  '恐らく',    // 追加（漢字版）
  'たぶん',    // 追加
  '多分'       // 追加（漢字版）
];;

/**
 * 推測表現を検出
 * @param text 検証するテキスト
 * @returns 推測表現の検出結果
 */
export function detectSpeculativeExpressions(text: string): SpeculativeExpressionResult {
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
      matches.forEach(match => {
        if (!expressions.includes(match)) {
          expressions.push(match);
        }
      });
    }
  }

  // 文の数を推定（。で区切られた数）
  const sentenceCount = (text.match(/。/g) || []).length || 1;
  const ratio = sentenceCount > 0 ? totalCount / sentenceCount : 0;

  return {
    count: totalCount,
    ratio: Math.round(ratio * 100) / 100,
    expressions
  };
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
  contentAnalysis?: ContentAnalysis  // オプショナル引数として追加
): QualityCheckResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  // コンテンツ長に基づく項目数要件を追加
  const contentLength = contentAnalysis?.totalLength || contentAnalysis?.contentLength || 0;
  
  // 動的な基準設定（contentAnalysisがある場合はそれを使用）
  const minSummaryLength = contentAnalysis?.isThinContent 
    ? (contentAnalysis.recommendedMinLength || 60)
    : 50;
  const maxSummaryLength = contentAnalysis?.isThinContent
    ? (contentAnalysis.recommendedMaxLength || 100)
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
      message: `一覧要約が短すぎる: ${summaryLength}文字（最小${minSummaryLength}文字）`
    });
    score -= 20;
  } else if (summaryLength < idealMinSummaryLength) {
    // 理想の最小値未満は短め
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `一覧要約が短め: ${summaryLength}文字（理想は${idealMinSummaryLength}-${idealMaxSummaryLength}文字）`
    });
    score -= 5;
  } else if (summaryLength > maxSummaryLength) {
    // 最大文字数を超える場合は長すぎる
    issues.push({
      type: 'length',
      severity: contentAnalysis?.isThinContent ? 'major' : 'minor',
      message: `一覧要約が長すぎる: ${summaryLength}文字（最大${maxSummaryLength}文字）`
    });
    score -= contentAnalysis?.isThinContent ? 15 : 10;
  }

  // 2. 詳細要約の文字数チェック（薄いコンテンツの場合は基準を緩和）
  const detailedLength = detailedSummary.length;
  const minDetailedLength = contentAnalysis?.isThinContent ? 50 : 200;
  const idealMinDetailedLength = contentAnalysis?.isThinContent ? 80 : 400;
  const maxDetailedLength = contentAnalysis?.isThinContent ? 200 : 800;
  
  if (!contentAnalysis?.isThinContent) {
    // 通常コンテンツの詳細要約チェック
    if (detailedLength < minDetailedLength) {
      issues.push({
        type: 'length',
        severity: 'major',
        message: `詳細要約が短すぎる: ${detailedLength}文字（最小${minDetailedLength}文字）`
      });
      score -= 20;
    } else if (detailedLength < idealMinDetailedLength) {
      issues.push({
        type: 'length',
        severity: 'minor',
        message: `詳細要約が短め: ${detailedLength}文字（理想は${idealMinDetailedLength}-600文字）`
      });
      score -= 5;
    } else if (detailedLength > maxDetailedLength) {
      issues.push({
        type: 'length',
        severity: 'minor',
        message: `詳細要約が長すぎる: ${detailedLength}文字（最大${maxDetailedLength}文字）`
      });
      score -= 10;
    }
  }

  // 3. 句点チェック
  if (!summary.endsWith('。')) {
    issues.push({
      type: 'punctuation',
      severity: 'minor',
      message: '一覧要約が句点で終わっていない'
    });
    score -= 5;
  }

  // ★★★ 重要な追加: 項目数チェック ★★★
  const itemCount = (detailedSummary.match(/・/g) || []).length;
  
  // コンテンツ長に応じた最低項目数の決定
  let minItems = 3; // デフォルト
  let recommendedItems = '3-4'; // デフォルト推奨
  
  if (contentLength >= 10000) {
    minItems = 6;
    recommendedItems = '7-8';
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
        message: `項目数不足: ${itemCount}個（最低${minItems}個必要、推奨${recommendedItems}個）`
      });
      score -= 30; // 大幅減点
    } else if (contentLength >= 10000 && itemCount < 7) {
      // 超長文記事で推奨値未満の場合
      issues.push({
        type: 'itemCount',
        severity: 'minor',
        message: `項目数が推奨値未満: ${itemCount}個（推奨7-8個）`
      });
      score -= 10;
    }
  }

  // 4. 詳細要約の形式チェック（薄いコンテンツの場合は箇条書きを必須としない）
  if (!contentAnalysis?.isThinContent) {
    const bulletPoints = (detailedSummary.match(/・/g) || []).length;
    if (bulletPoints === 0) {
      issues.push({
        type: 'format',
        severity: 'major',
        message: '詳細要約に箇条書き（・）が含まれていない'
      });
      score -= 15;
    } else if (bulletPoints < 3 && contentLength < 3000) {
      // 短い記事の場合のみ項目数チェック
      issues.push({
        type: 'format',
        severity: 'minor',
        message: `詳細要約の項目数が少ない: ${bulletPoints}項目（理想は3-5項目）`
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
    expressions: [...summarySpeculative.expressions, ...detailedSpeculative.expressions]
  };
  
  if (contentAnalysis?.isThinContent && speculativeResult.count > 0) {
    // 薄いコンテンツでは推測表現は厳禁
    issues.push({
      type: 'speculative',
      severity: 'critical',
      message: `推測表現は厳禁: ${speculativeResult.count}個（${speculativeResult.expressions.join('、')}）`
    });
    score -= 50;  // 大幅減点
  } else if (speculativeResult.count >= 3) {
    issues.push({
      type: 'speculative',
      severity: 'major',
      message: `推測表現が多すぎる: ${speculativeResult.count}個（${speculativeResult.expressions.join('、')}）`
    });
    score -= 20;
  } else if (speculativeResult.count >= 2) {
    issues.push({
      type: 'speculative',
      severity: 'minor',
      message: `推測表現が含まれている: ${speculativeResult.count}個`
    });
    score -= 10;
  }

  // 6. 空の項目チェック
  const lines = detailedSummary.split('\n');
  const emptyBullets = lines.filter(line => line.trim() === '・').length;
  if (emptyBullets > 0) {
    issues.push({
      type: 'format',
      severity: 'critical',
      message: `空の箇条書き項目がある: ${emptyBullets}個`
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
        message: '一覧要約と詳細要約が完全に同一'
      });
      score = 0; // 重複の場合はスコア0
    }
    // 最初の100文字が同じかチェック
    else if (summary.substring(0, 100) === detailedSummary.substring(0, 100) && summary.length >= 100) {
      issues.push({
        type: 'duplicate',
        severity: 'major',
        message: '一覧要約と詳細要約の最初の100文字が同一'
      });
      score -= 30;
    }
    // 詳細要約に箇条書きがないかチェック（薄いコンテンツ以外）
    if (!contentAnalysis?.isThinContent && !detailedSummary.includes('・')) {
      issues.push({
        type: 'format',
        severity: 'major',
        message: '詳細要約に箇条書き形式がない'
      });
      score -= 20;
    }
  }

  // スコアの調整
  score = Math.max(0, score);

  // 再生成が必要かどうかの判定（項目数不足も含む）
  const requiresRegeneration = 
    score < (parseInt(process.env.QUALITY_MIN_SCORE || '70')) ||
    issues.some(issue => issue.severity === 'critical') ||
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
    itemCountValid: itemCount >= minItems // 項目数が有効かどうか
  };
}

/**
 * 品質チェック結果の統計情報を計算
 */
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
      criticalIssuesCount: 0
    };
  }
  
  const validCount = results.filter(r => r.isValid).length;
  const invalidCount = totalCount - validCount;
  const requiresRegenerationCount = results.filter(r => r.requiresRegeneration).length;
  const averageScore = results.reduce((sum, r) => sum + r.score, 0) / totalCount;
  const regenerationRate = Math.round((requiresRegenerationCount / totalCount) * 100);
  
  // issueタイプごとの集計
  const issuesSummary: Record<string, number> = {};
  let minorIssuesCount = 0;
  let majorIssuesCount = 0;
  let criticalIssuesCount = 0;
  
  results.forEach(result => {
    result.issues.forEach(issue => {
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
    criticalIssuesCount
  };
}

/**
 * 品質チェック機能が有効かどうか
 */
/**
 * 品質チェックが有効かどうかを判定
 */
export function isQualityCheckEnabled(): boolean {
  // 環境変数が設定されていない場合はデフォルトでtrue
  if (process.env.QUALITY_CHECK_ENABLED === undefined) {
    return true;
  }
  return process.env.QUALITY_CHECK_ENABLED === 'true';
}

/**
 * 最大再生成回数を取得
 */
/**
 * 最大再生成試行回数を取得
 */
export function getMaxRegenerationAttempts(): number {
  const value = parseInt(process.env.MAX_REGENERATION_ATTEMPTS || '3');
  return isNaN(value) ? 3 : value;
}

/**
 * 品質スコアの最小値を取得
 */
/**
 * 品質スコアの最小値を取得
 */
export function getMinQualityScore(): number {
  const value = parseInt(process.env.QUALITY_MIN_SCORE || '70');
  return isNaN(value) ? 70 : value;
}

/**
 * 品質レポートを生成
 */
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
    result.issues.forEach(issue => {
      const icon = issue.severity === 'critical' ? '🔴' : 
                   issue.severity === 'major' ? '🟡' : '🔵';
      lines.push(`- ${icon} [${issue.severity}] ${issue.message}`);
    });
  } else {
    lines.push('');
    lines.push('問題点なし');
  }
  
  return lines.join('\n');
}

// 既存の関数の継続...

/**
 * テキストのクリーンアップ
 * 要約テキストから不要な記号や重複を除去
 */
export function cleanupText(text: string): string {
  return text
    .replace(/\s+/g, ' ')  // 連続する空白を1つに
    .replace(/。{2,}/g, '。')  // 連続する句点を1つに
    .replace(/、{2,}/g, '、')  // 連続する読点を1つに
    .replace(/\n{3,}/g, '\n\n')  // 3つ以上の改行を2つに
    .trim();
}

/**
 * 詳細要約専用のクリーンアップ
 * 改行を保持しつつクリーンアップ
 */
export function cleanupDetailedSummary(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line !== '・')  // 空の箇条書きを除去
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
  if (title && expandedSummary.length < 30 && !expandedSummary.includes(title.substring(0, 10))) {
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
          expandedSummary += '。' + additionalText.substring(0, lastPeriodIndex + 1);
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

/**
 * 品質スコアを計算（新機能）
 * 推測表現を考慮した品質スコアの計算
 */
export function calculateQualityScore(
  summary: string,
  detailedSummary: string,
  speculativeWeight: number = 2.0
): number {
  const baseCheck = checkSummaryQuality(summary, detailedSummary);
  let score = baseCheck.score;
  
  // 推測表現による追加ペナルティ
  if (baseCheck.speculativeExpressions) {
    const speculativePenalty = baseCheck.speculativeExpressions.count * speculativeWeight;
    score = Math.max(0, score - speculativePenalty);
  }
  
  return score;
}