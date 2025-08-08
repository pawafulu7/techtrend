/**
 * 要約の品質を検証するユーティリティ関数
 */

/**
 * 要約が適切な形式かどうかを検証
 * @param summary 検証する要約文字列
 * @returns 検証結果
 */
export function validateSummary(summary: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!summary || summary.trim().length === 0) {
    errors.push('要約が空です');
    return { isValid: false, errors };
  }
  
  // 不完全な終了パターンをチェック
  const incompletePatterns = [
    '。詳',
    '詳。',
    'CL。',
    '分析。',
    'る。詳',
    'い。詳',
    'た。詳'
  ];
  
  for (const pattern of incompletePatterns) {
    if (summary.endsWith(pattern)) {
      errors.push(`要約が不完全な形で終わっています: "${pattern}"`);
    }
  }
  
  // 最小文字数チェック
  if (summary.length < 50) {
    errors.push(`要約が短すぎます（${summary.length}文字）。最低50文字必要です`);
  }
  
  // 最大文字数チェック（警告のみ）
  if (summary.length > 150) {
    errors.push(`要約が長すぎます（${summary.length}文字）。推奨は80-120文字です`);
  }
  
  // 句点で終わっているかチェック
  if (!summary.endsWith('。')) {
    errors.push('要約が句点（。）で終わっていません');
  }
  
  // 不要なラベルが含まれていないかチェック
  const unwantedLabels = ['要約:', '要約：', 'Summary:', '概要:', '概要：'];
  for (const label of unwantedLabels) {
    if (summary.includes(label)) {
      errors.push(`要約に不要なラベル "${label}" が含まれています`);
    }
  }
  
  // 改行が含まれていないかチェック
  if (summary.includes('\n')) {
    errors.push('要約に改行が含まれています');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 詳細要約が適切な形式かどうかを検証
 * @param detailedSummary 検証する詳細要約文字列
 * @returns 検証結果
 */
export function validateDetailedSummary(detailedSummary: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!detailedSummary || detailedSummary.trim().length === 0) {
    errors.push('詳細要約が空です');
    return { isValid: false, errors, warnings };
  }
  
  // 箇条書きが含まれているかチェック
  if (!detailedSummary.includes('・')) {
    errors.push('詳細要約に箇条書き（・）が含まれていません');
  }
  
  // 汎用的な文言が含まれていないかチェック
  const genericPhrases = [
    '記事内のコード例や手順を参照してください',
    '詳細は記事本文をご確認ください',
    '記事を参照してください'
  ];
  
  for (const phrase of genericPhrases) {
    if (detailedSummary.includes(phrase)) {
      warnings.push(`詳細要約に汎用的な文言 "${phrase}" が含まれています`);
    }
  }
  
  // 最小文字数チェック
  if (detailedSummary.length < 200) {
    warnings.push(`詳細要約が短い可能性があります（${detailedSummary.length}文字）`);
  }
  
  // 構造化されているかチェック（6項目あるか）
  const bulletPoints = detailedSummary.split('\n').filter(line => line.trim().startsWith('・'));
  if (bulletPoints.length < 3) {
    errors.push(`詳細要約の項目数が少なすぎます（${bulletPoints.length}項目）。最低3項目必要です`);
  } else if (bulletPoints.length < 6) {
    warnings.push(`詳細要約の項目数が推奨より少ないです（${bulletPoints.length}項目）。推奨は6項目です`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 要約をクリーンアップ（不要な要素を除去）
 * @param summary クリーンアップする要約
 * @returns クリーンアップされた要約
 */
export function cleanupSummary(summary: string): string {
  let cleaned = summary.trim();
  
  // ラベルを除去
  const labelsToRemove = [
    /^要約[:：]\s*/,
    /^Summary[:：]\s*/,
    /^概要[:：]\s*/,
    /^\*\*要約\*\*[:：]?\s*/,
    /^##\s*要約[:：]?\s*/
  ];
  
  for (const pattern of labelsToRemove) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // 複数の改行を除去
  cleaned = cleaned.replace(/\n+/g, ' ').trim();
  
  // 複数のスペースを1つに
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // 末尾に句点がない場合は追加
  if (!cleaned.endsWith('。') && cleaned.length > 0) {
    cleaned += '。';
  }
  
  return cleaned;
}

/**
 * タグの検証と正規化
 * @param tags 検証するタグの配列
 * @returns 検証・正規化されたタグの配列
 */
export function validateAndNormalizeTags(tags: string[]): string[] {
  const normalizedTags: string[] = [];
  const seen = new Set<string>();
  
  for (const tag of tags) {
    const trimmed = tag.trim();
    
    // 空のタグはスキップ
    if (trimmed.length === 0) continue;
    
    // 長すぎるタグはスキップ
    if (trimmed.length > 30) continue;
    
    // 重複チェック（大文字小文字を無視）
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    
    seen.add(lower);
    normalizedTags.push(trimmed);
  }
  
  // 最大5個まで
  return normalizedTags.slice(0, 5);
}