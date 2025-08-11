/**
 * 要約品質チェック機能
 * 統一プロンプトによる要約生成の品質を検証し、再生成の必要性を判定
 */

export interface QualityCheckResult {
  isValid: boolean;
  issues: QualityIssue[];
  requiresRegeneration: boolean;
  score: number;
  speculativeExpressions?: SpeculativeExpressionResult;
}

export interface QualityIssue {
  type: 'length' | 'format' | 'punctuation' | 'speculative';
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
  '予想される'
];

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
  detailedSummary: string
): QualityCheckResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  // 1. 一覧要約の文字数チェック
  const summaryLength = summary.length;
  if (summaryLength < 50) {
    // 50文字未満は短すぎる
    issues.push({
      type: 'length',
      severity: 'major',
      message: `一覧要約が短すぎる: ${summaryLength}文字（最小50文字）`
    });
    score -= 20;
  } else if (summaryLength < 100) {
    // 50-100文字は短めだが許容
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `一覧要約が短め: ${summaryLength}文字（理想は100-180文字）`
    });
    score -= 5;
  } else if (summaryLength > 200) {
    // 200文字を超える場合は長すぎる
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `一覧要約が長すぎる: ${summaryLength}文字（最大200文字）`
    });
    score -= 10;
  }

  // 2. 詳細要約の文字数チェック
  const detailedLength = detailedSummary.length;
  if (detailedLength < 200) {
    issues.push({
      type: 'length',
      severity: 'major',
      message: `詳細要約が短すぎる: ${detailedLength}文字（最小200文字）`
    });
    score -= 20;
  } else if (detailedLength < 400) {
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `詳細要約が短め: ${detailedLength}文字（理想は400-600文字）`
    });
    score -= 5;
  } else if (detailedLength > 800) {
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `詳細要約が長すぎる: ${detailedLength}文字（最大800文字）`
    });
    score -= 10;
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

  // 4. 詳細要約の形式チェック
  const bulletPoints = (detailedSummary.match(/・/g) || []).length;
  if (bulletPoints === 0) {
    issues.push({
      type: 'format',
      severity: 'major',
      message: '詳細要約に箇条書き（・）が含まれていない'
    });
    score -= 15;
  } else if (bulletPoints < 3) {
    issues.push({
      type: 'format',
      severity: 'minor',
      message: `詳細要約の項目数が少ない: ${bulletPoints}項目（理想は3-5項目）`
    });
    score -= 5;
  }

  // 5. 推測表現のチェック
  const speculativeResult = detectSpeculativeExpressions(detailedSummary);
  if (speculativeResult.count >= 3) {
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

  // スコアの調整
  score = Math.max(0, score);

  // 再生成が必要かどうかの判定
  const requiresRegeneration = 
    score < (parseInt(process.env.QUALITY_MIN_SCORE || '70')) ||
    issues.some(issue => issue.severity === 'critical');

  return {
    isValid: score >= 60,
    issues,
    requiresRegeneration,
    score,
    speculativeExpressions: speculativeResult
  };
}

/**
 * 品質チェック機能が有効かどうか
 */
export function isQualityCheckEnabled(): boolean {
  return process.env.QUALITY_CHECK_ENABLED === 'true';
}

/**
 * 最大再生成回数を取得
 */
export function getMaxRegenerationAttempts(): number {
  return parseInt(process.env.MAX_REGENERATION_ATTEMPTS || '3');
}

/**
 * 品質レポートを生成
 */
export function generateQualityReport(result: QualityCheckResult): string {
  const lines = [
    `📊 品質スコア: ${result.score}/100`,
    `✅ 有効: ${result.isValid ? 'はい' : 'いいえ'}`,
    `🔄 再生成必要: ${result.requiresRegeneration ? 'はい' : 'いいえ'}`,
  ];

  if (result.speculativeExpressions && result.speculativeExpressions.count > 0) {
    lines.push(`🤔 推測表現: ${result.speculativeExpressions.count}個`);
  }

  if (result.issues.length > 0) {
    lines.push('📋 問題点:');
    for (const issue of result.issues) {
      const icon = issue.severity === 'critical' ? '🔴' : 
                   issue.severity === 'major' ? '🟠' : '🟡';
      lines.push(`  ${icon} ${issue.message}`);
    }
  }

  return lines.join('\n');
}

// 既存の関数の継続...

/**
 * テキストのクリーンアップ
 * 要約テキストから不要な記号や重複を除去
 */
function cleanupText(text: string): string {
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
function cleanupDetailedSummary(text: string): string {
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