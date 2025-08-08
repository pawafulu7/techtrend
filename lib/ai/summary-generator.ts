/**
 * 要約生成の共通処理
 * 記事タイプ判定、プロンプト生成、品質検証を統一的に処理
 */

import { detectArticleType, ArticleType } from '../utils/article-type-detector';
import { generatePromptForArticleType } from '../utils/article-type-prompts';
import { validateSummary, validateDetailedSummary } from '../utils/summary-validator';

/**
 * 通常要約用のプロンプトを生成
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 生成されたプロンプト
 */
export function createSummaryPrompt(title: string, content: string): string {
  // コンテンツを適切な長さに制限
  const truncatedContent = content.substring(0, 2000);
  
  // 記事タイプを判定
  const articleType = detectArticleType(title, truncatedContent);
  
  // 記事タイプに応じた説明を生成
  const typeDescriptions: Record<ArticleType, string> = {
    'implementation': '個人開発・実装レポート',
    'tutorial': 'チュートリアル・学習ガイド',
    'problem-solving': '問題解決・技術改善',
    'tech-intro': '技術紹介・解説',
    'release': '新機能・リリース情報'
  };
  
  return `以下の${typeDescriptions[articleType]}記事を日本語で要約してください。

タイトル: ${title}
内容: ${truncatedContent}

重要な指示:
1. 100-120文字で要約（厳守：最大130文字まで）
2. 著者の自己紹介や前置きは除外
3. 記事が提供する価値や解決する問題を明確に含める
4. 具体的な技術名、数値、手法を含める
5. 必ず完全な文で終わる（「。」で終了）
6. 簡潔に、一文または二文で表現

絶対に守るべきルール:
- 「本記事は」「この記事では」「〜について解説」などの前置き文言を使わない
- 要約は記事の内容そのものから直接始める
- 「要約:」「要約：」などのラベルを付けない
- 要約内容のみを出力

記事タイプ別の重点:
${articleType === 'implementation' ? '- 作ったものと使用技術を明確に\n- 実装した機能や特徴を具体的に' : ''}
${articleType === 'tutorial' ? '- 学習内容と手順を具体的に\n- 対象技術とゴールを明確に' : ''}
${articleType === 'problem-solving' ? '- 解決した問題と解決策を明確に\n- 効果や改善点を具体的に' : ''}
${articleType === 'tech-intro' ? '- 技術の特徴と用途を説明\n- メリットや活用シーンを含める' : ''}
${articleType === 'release' ? '- 新機能と対象ユーザーを明確に\n- 主要な改善点や特徴を含める' : ''}

要約:`;
}

/**
 * 詳細要約用のプロンプトを生成
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 生成されたプロンプト
 */
export function createDetailedSummaryPrompt(title: string, content: string): string {
  // コンテンツを適切な長さに制限
  const truncatedContent = content.substring(0, 4000);
  
  // 記事タイプを判定
  const articleType = detectArticleType(title, truncatedContent);
  
  // 記事タイプに応じた詳細プロンプトを生成
  return generatePromptForArticleType(articleType, title, truncatedContent);
}

/**
 * 要約の後処理（文字数調整、前置き文言除去など）
 * @param summary 生成された要約
 * @param maxLength 最大文字数
 * @returns 処理後の要約
 */
export function postProcessSummary(summary: string, maxLength: number = 130): string {
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
  
  // 文字数が超過している場合は調整
  if (processed.length > maxLength) {
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

/**
 * 記事情報を取得（デバッグ用）
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 記事情報
 */
export function getArticleInfo(title: string, content: string) {
  const articleType = detectArticleType(title, content);
  
  return {
    type: articleType,
    titleLength: title.length,
    contentLength: content.length,
    estimatedReadingTime: Math.ceil(content.length / 400) // 400文字/分として計算
  };
}