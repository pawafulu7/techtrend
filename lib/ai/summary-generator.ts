/**
 * 要約生成の共通処理
 * 統一プロンプトによる品質保証と再生成ロジックを含む
 */

// import { detectArticleType, ArticleType } from '../utils/article-type-detector';  // 統一プロンプト移行により無効化
// import { generatePromptForArticleType } from '../utils/article-type-prompts';  // 統一プロンプト移行により無効化
import { generateUnifiedPrompt } from '../utils/article-type-prompts';
import { validateSummary, validateDetailedSummary } from '../utils/summary-validator';
import { 
  checkSummaryQuality, 
  isQualityCheckEnabled,
  getMaxRegenerationAttempts,
  generateQualityReport,
  QualityCheckResult
} from '../utils/summary-quality-checker';
import { generateSummaryAndTags as geminiGenerateSummary } from './gemini-handler';

/**
 * 通常要約用のプロンプトを生成（統一プロンプトを使用）
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 生成されたプロンプト
 * @deprecated 統一プロンプトに移行。createUnifiedSummaryPromptを使用してください
 */
export function createSummaryPrompt(title: string, content: string): string {
  // 統一プロンプトにリダイレクト
  return generateUnifiedPrompt(title, content);
}

/**
 * 詳細要約用のプロンプトを生成（統一プロンプトを使用）
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 生成されたプロンプト
 * @deprecated 統一プロンプトに移行。createUnifiedSummaryPromptを使用してください
 */
export function createDetailedSummaryPrompt(title: string, content: string): string {
  // 統一プロンプトにリダイレクト
  return generateUnifiedPrompt(title, content);
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
  // 統一プロンプト移行により記事タイプは'unified'固定
  return {
    type: 'unified',
    titleLength: title.length,
    contentLength: content.length,
    estimatedReadingTime: Math.ceil(content.length / 400) // 400文字/分として計算
  };
}

/**
 * 品質チェックを含む要約生成（再生成ロジック付き）
 * @param title 記事タイトル
 * @param content 記事内容
 * @param maxAttempts 最大試行回数
 * @returns 生成された要約とタグ
 */
export async function generateSummaryWithRetry(
  title: string,
  content: string,
  maxAttempts?: number
): Promise<{
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
  qualityScore?: number;
  attempts?: number;
}> {
  // 品質チェックが無効の場合は従来の処理
  if (!isQualityCheckEnabled()) {
    const result = await geminiGenerateSummary(title, content);
    return result;
  }

  const maxTries = maxAttempts || getMaxRegenerationAttempts();
  let lastResult: any = null;
  let lastQuality: QualityCheckResult | null = null;
  
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      // 要約生成
      const result = await geminiGenerateSummary(title, content);
      
      // 品質チェック
      const quality = checkSummaryQuality(result.summary, result.detailedSummary);
      
      // 品質レポートをログ出力
      if (attempt === 1 || quality.requiresRegeneration) {
        console.log(`\n=== 品質チェック (試行 ${attempt}/${maxTries}) ===`);
        console.log(generateQualityReport(quality));
      }
      
      // 品質基準を満たした場合
      if (quality.isValid && !quality.requiresRegeneration) {
        console.log(`✅ 品質チェック合格（試行 ${attempt}/${maxTries}）スコア: ${quality.score}/100`);
        return {
          ...result,
          qualityScore: quality.score,
          attempts: attempt
        };
      }
      
      lastResult = result;
      lastQuality = quality;
      
      // 再生成が必要な場合
      if (attempt < maxTries && quality.requiresRegeneration) {
        console.log(`⚠️ 品質問題検出 - 再生成を実行します`);
        
        // API負荷軽減のため待機
        const waitTime = attempt * 1000; // 試行回数に応じて待機時間を増やす
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
    } catch (error) {
      console.error(`❌ 生成エラー（試行 ${attempt}/${maxTries}）:`, error);
      
      // 最終試行でエラーの場合は例外を再スロー
      if (attempt === maxTries) {
        throw error;
      }
      
      // エラー時はより長い待機時間
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // 最大試行回数に達した場合、最後の結果を返す（ベストエフォート）
  if (lastResult && lastQuality) {
    console.log(`⚠️ 品質基準を満たせませんでしたが、最後の結果を使用します（スコア: ${lastQuality.score}/100）`);
    return {
      ...lastResult,
      qualityScore: lastQuality.score,
      attempts: maxTries
    };
  }
  
  // 結果が全く得られなかった場合
  throw new Error('要約生成に失敗しました');
}

/**
 * 統一プロンプトによる要約生成
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 統一プロンプト
 */
export function createUnifiedSummaryPrompt(title: string, content: string): string {
  return generateUnifiedPrompt(title, content);
}