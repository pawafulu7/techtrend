/**
 * 要約の品質を検証するユーティリティ関数
 */

import { ArticleType } from './article-type-detector';

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
  
  // 最小文字数チェック（Phase 3: 90文字に変更）
  if (summary.length < 90) {
    errors.push(`要約が短すぎます（${summary.length}文字）。最低90文字必要です`);
  }
  
  // 最大文字数チェック（Phase 3: 130文字に変更）
  if (summary.length > 130) {
    errors.push(`要約が長すぎます（${summary.length}文字）。最大130文字までです`);
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
  
  // Phase 3: 前置き文言のチェック
  const prefixPatterns = [
    '本記事は',
    'この記事では',
    'この記事は',
    '本稿では',
    '今回は',
    '本記事では',
    '記事では',
    '〜について解説',
    '〜を解説',
    '〜を紹介'
  ];
  
  for (const pattern of prefixPatterns) {
    if (summary.startsWith(pattern)) {
      errors.push(`要約が定型的な前置き文言 "${pattern}" で始まっています`);
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
  
  // Phase 3: 前置き文言の除去（正規表現）
  const prefixPatterns = [
    /^本記事は、?/,
    /^この記事では、?/,
    /^この記事は、?/,
    /^本稿では、?/,
    /^今回は、?/,
    /^本記事では、?/,
    /^記事では、?/
  ];
  
  for (const pattern of prefixPatterns) {
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

/**
 * Phase 3: 記事タイプ別の検証基準
 * @param summary 検証する要約
 * @param articleType 記事タイプ
 * @returns 検証結果
 */
export function validateByArticleType(
  summary: string,
  articleType: ArticleType
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // まず基本的な検証を実行
  const baseValidation = validateSummary(summary);
  errors.push(...baseValidation.errors);
  
  // 記事タイプ別の追加検証
  switch (articleType) {
    case 'implementation':
      // 実装レポートは具体的な成果物が必要
      if (!summary.match(/開発|実装|作成|構築|作った|作る/)) {
        warnings.push('実装レポートには開発・実装に関する記述が必要です');
      }
      break;
      
    case 'tutorial':
      // チュートリアルは手順や方法の記述が必要
      if (!summary.match(/方法|手順|ガイド|チュートリアル|入門|学習|解説/)) {
        warnings.push('チュートリアルには手順や方法の記述が必要です');
      }
      break;
      
    case 'problem-solving':
      // 問題解決は課題と解決策が必要
      if (!summary.match(/解決|改善|最適化|対処|問題|課題|修正/)) {
        warnings.push('問題解決記事には課題と解決策の記述が必要です');
      }
      break;
      
    case 'tech-intro':
      // 技術紹介は特徴や利点の記述が必要
      if (!summary.match(/紹介|解説|特徴|メリット|利点|概要|基礎/)) {
        warnings.push('技術紹介記事には特徴や利点の記述が必要です');
      }
      break;
      
    case 'release':
      // リリース情報は新機能やバージョンが必要
      if (!summary.match(/リリース|発表|公開|新機能|バージョン|アップデート/)) {
        warnings.push('リリース情報には新機能やバージョンの記述が必要です');
      }
      break;
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Phase 3: 要約の自動修正機能
 * @param summary 修正する要約
 * @param maxLength 最大文字数（デフォルト: 130）
 * @returns 修正された要約
 */
export function autoFixSummary(summary: string, maxLength: number = 130): string {
  let fixed = summary.trim();
  
  // 1. ラベルの除去
  const labelsToRemove = [
    /^要約[:：]\s*/,
    /^Summary[:：]\s*/,
    /^概要[:：]\s*/,
    /^\*\*要約\*\*[:：]?\s*/,
    /^##\s*要約[:：]?\s*/
  ];
  
  for (const pattern of labelsToRemove) {
    fixed = fixed.replace(pattern, '');
  }
  
  // 2. 前置き文言の除去
  const prefixPatterns = [
    /^本記事は、?/,
    /^この記事では、?/,
    /^この記事は、?/,
    /^本稿では、?/,
    /^今回は、?/,
    /^本記事では、?/,
    /^記事では、?/,
    /^〜について解説/,
    /^〜を解説/,
    /^〜を紹介/
  ];
  
  for (const pattern of prefixPatterns) {
    fixed = fixed.replace(pattern, '');
  }
  
  // 3. 改行を空白に置換
  fixed = fixed.replace(/\n+/g, ' ');
  
  // 4. 複数の空白を1つに
  fixed = fixed.replace(/\s+/g, ' ').trim();
  
  // 5. 文字数が超過している場合は調整
  if (fixed.length > maxLength) {
    // 句点で区切って調整
    const sentences = fixed.split('。');
    let result = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      
      if (result.length + trimmedSentence.length + 1 <= maxLength) {
        result += (result ? '。' : '') + trimmedSentence;
      } else {
        // これ以上追加できない場合は終了
        break;
      }
    }
    
    // 最低1文は含める
    if (!result && sentences.length > 0) {
      const firstSentence = sentences[0].trim();
      if (firstSentence.length > maxLength - 1) {
        result = firstSentence.substring(0, maxLength - 1);
      } else {
        result = firstSentence;
      }
    }
    
    fixed = result;
  }
  
  // 6. 句点で終わっていない場合は追加
  if (!fixed.endsWith('。') && fixed.length > 0) {
    fixed += '。';
  }
  
  // 7. 不完全な終了パターンの修正
  const incompletePatterns = [
    /。詳$/,
    /詳。$/,
    /CL。$/,
    /分析。$/,
    /る。詳$/,
    /い。詳$/,
    /た。詳$/
  ];
  
  for (const pattern of incompletePatterns) {
    if (pattern.test(fixed)) {
      // 不完全な部分を除去
      fixed = fixed.replace(pattern, '。');
    }
  }
  
  return fixed;
}