/**
 * 旧経路（lib/ai/gemini.ts）の要約生成の共通処理（プロンプト・後処理・検証）。
 * 本番の要約生成は lib/ai/service/ を使う
 */

// import { detectArticleType, ArticleType } from '../utils/article/article-type-detector';  // 統一プロンプト移行により無効化
// import { generatePromptForArticleType } from '../utils/article/article-type-prompts';  // 統一プロンプト移行により無効化
import { generateUnifiedPrompt } from '../utils/article/article-type-prompts';
import { validateSummary, validateDetailedSummary } from '../utils/summary/summary-validator';
import { SUMMARY_LENGTH } from './constants';

/**
 * 通常要約用のプロンプトを生成（統一プロンプトを使用）
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 生成されたプロンプト
 */
export function createSummaryPrompt(title: string, content: string): string {
  // 統一プロンプトにリダイレクト
  return generateUnifiedPrompt(title, content);
}

/**
 * 要約の後処理（文字数調整、前置き文言除去など）
 * @param summary 生成された要約
 * @param maxLength 最大文字数（既定は要約生成と同じ上限 SUMMARY_LENGTH.hardMax）
 * @returns 処理後の要約
 */
export function postProcessSummary(
  summary: string,
  maxLength: number = SUMMARY_LENGTH.hardMax
): string {
  let processed = summary.trim();
  
  // 前置き文言の除去
  const prefixPatterns = [
    /^本記事は、?/,
    /^この記事では、?/,
    /^この記事は、?/,
    /^本稿では、?/,
    /^今回は、?/
  ];
  
  for (const pattern of prefixPatterns) {
    processed = processed.replace(pattern, '');
  }
  
  // 文字数が超過している場合は調整（後で句点を足す分も含めて maxLength 以内にする）
  const limitBeforePeriod = processed.endsWith('。') ? maxLength : maxLength - 1;
  if (processed.length > limitBeforePeriod) {
    // 最後の句点までで切る
    const sentences = processed.split('。');
    let result = '';
    
    for (const sentence of sentences) {
      if (result.length + sentence.length + 1 <= maxLength) {
        result += (result ? '。' : '') + sentence;
      } else {
        break;
      }
    }
    
    // 少なくとも1文は含める
    if (!result && sentences.length > 0) {
      result = sentences[0].substring(0, maxLength - 1);
    }
    
    processed = result + '。';
  }
  
  // 句点で終わっていない場合は追加
  if (!processed.endsWith('。')) {
    processed += '。';
  }
  
  return processed;
}

/**
 * 要約の品質を検証
 * @param summary 検証する要約
 * @param type 要約タイプ（通常/詳細）
 * @returns 検証結果
 */
export function validateSummaryQuality(
  summary: string, 
  type: 'normal' | 'detailed' = 'normal'
): { isValid: boolean; errors: string[]; warnings: string[] } {
  if (type === 'normal') {
    const result = validateSummary(summary);
    return { ...result, warnings: [] };
  } else {
    return validateDetailedSummary(summary);
  }
}
