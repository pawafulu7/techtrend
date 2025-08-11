/**
 * 統一要約生成サービス
 * 全ての要約生成処理で使用する統一インターフェース
 */

import fetch from 'node-fetch';
import { generateUnifiedPrompt } from '../utils/article-type-prompts';
import { parseUnifiedResponse, validateParsedResult, ParsedSummaryResult } from './unified-summary-parser';
import { checkSummaryQuality } from '../utils/summary-quality-checker';

export interface UnifiedSummaryResult extends ParsedSummaryResult {
  articleType: 'unified';
  summaryVersion: 5;
  qualityScore?: number;
}

export interface GenerateOptions {
  maxRetries?: number;
  retryDelay?: number;
  minQualityScore?: number;
  contentMaxLength?: number;
}

/**
 * 統一要約生成サービスクラス
 */
export class UnifiedSummaryService {
  private static readonly SUMMARY_VERSION = 5;
  private static readonly ARTICLE_TYPE = 'unified' as const;
  private static readonly DEFAULT_OPTIONS: GenerateOptions = {
    maxRetries: 3,
    retryDelay: 5000,
    minQualityScore: 40,
    contentMaxLength: 5000
  };

  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
  }

  /**
   * 要約を生成
   */
  async generate(
    title: string, 
    content: string, 
    options?: GenerateOptions,
    sourceInfo?: { sourceName?: string, url?: string }
  ): Promise<UnifiedSummaryResult> {
    const opts = { ...UnifiedSummaryService.DEFAULT_OPTIONS, ...options };
    
    // コンテンツの前処理
    const processedContent = this.preprocessContent(title, content, opts.contentMaxLength!, sourceInfo);
    
    // スキップマーカーのチェック
    if (processedContent === '__SKIP_SUMMARY_GENERATION__') {
      throw new Error('SKIP_GENERATION: はてなブックマーク経由の外部サイト記事でコンテンツ不足のため、要約生成をスキップします');
    }
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= opts.maxRetries!; attempt++) {
      try {
        // プロンプト生成
        const prompt = generateUnifiedPrompt(title, processedContent);
        
        // API呼び出し
        const responseText = await this.callGeminiAPI(prompt);
        
        // レスポンスのパース
        const parsed = parseUnifiedResponse(responseText);
        
        // 検証
        if (!validateParsedResult(parsed)) {
          throw new Error('Invalid parsed result');
        }
        
        // postProcessSummariesをインポートして適用
        const { postProcessSummaries } = await import('../utils/summary-post-processor');
        const processed = postProcessSummaries(parsed.summary, parsed.detailedSummary);
        
        // 品質チェック（処理後のテキストで実施）
        const qualityScore = checkSummaryQuality(
          processed.summary, 
          processed.detailedSummary
        ).score;
        
        // 品質スコアが閾値以下の場合、再試行
        if (qualityScore < opts.minQualityScore! && attempt < opts.maxRetries!) {
          console.log(`Quality score ${qualityScore} is below threshold ${opts.minQualityScore}. Retrying...`);
          await this.delay(opts.retryDelay!);
          continue;
        }
        
        // 結果を返す（postProcessSummariesで処理済みのテキストを使用）
        return {
          summary: processed.summary,
          detailedSummary: processed.detailedSummary,
          tags: parsed.tags,
          articleType: UnifiedSummaryService.ARTICLE_TYPE,
          summaryVersion: UnifiedSummaryService.SUMMARY_VERSION,
          qualityScore
        };
        
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt} failed:`, error);
        
        // Rate limitエラーの場合は長めに待機
        if (this.isRateLimitError(error)) {
          await this.delay(opts.retryDelay! * 3);
        } else if (attempt < opts.maxRetries!) {
          await this.delay(opts.retryDelay!);
        }
      }
    }
    
    throw new Error(`Failed to generate summary after ${opts.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * レスポンステキストをパース（公開メソッド）
   */
  parseResponse(text: string): UnifiedSummaryResult {
    const parsed = parseUnifiedResponse(text);
    const qualityScore = checkSummaryQuality(parsed.summary, parsed.detailedSummary).score;
    
    return {
      ...parsed,
      articleType: UnifiedSummaryService.ARTICLE_TYPE,
      summaryVersion: UnifiedSummaryService.SUMMARY_VERSION,
      qualityScore
    };
  }

  /**
   * 結果の検証（公開メソッド）
   */
  validateResult(result: UnifiedSummaryResult): boolean {
    return validateParsedResult(result) && 
           result.summaryVersion === UnifiedSummaryService.SUMMARY_VERSION &&
           result.articleType === UnifiedSummaryService.ARTICLE_TYPE;
  }

  /**
   * サマリーバージョンを取得
   */
  getSummaryVersion(): number {
    return UnifiedSummaryService.SUMMARY_VERSION;
  }

  /**
   * コンテンツの前処理
   */
  private preprocessContent(title: string, content: string, maxLength: number, sourceInfo?: { sourceName?: string, url?: string }): string {
    // はてなブックマーク経由の外部サイト記事でコンテンツ不足の場合
    if (sourceInfo?.sourceName === 'はてなブックマーク' && 
        content.length < 300 &&
        (sourceInfo.url?.includes('speakerdeck.com') || 
         sourceInfo.url?.includes('slideshare.net'))) {
      // 要約生成不可のマーカーを返す
      return '__SKIP_SUMMARY_GENERATION__';
    }
    
    if (!content || content.length < 100) {
      // 推測指示を削除し、基本情報のみ返す
      return `タイトル: ${title}\n\n内容:\n${content || 'コンテンツ不足'}\n\n注意: 内容が不十分なため、実際の記事内容に基づいた要約のみを生成してください。推測や憶測は避けてください。`;
    }
    
    if (content.length > maxLength) {
      // 長すぎる場合は切り詰め
      return content.substring(0, maxLength);
    }
    
    return content;
  }

  /**
   * Gemini APIを呼び出し
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,
          topP: 0.8,
          topK: 40
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.candidates[0].content.parts[0].text.trim();
  }

  /**
   * Rate limitエラーかチェック
   */
  private isRateLimitError(error: any): boolean {
    const message = error?.message || String(error);
    return message.includes('429') || 
           message.includes('rate') || 
           message.includes('quota') ||
           message.includes('503');
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * シングルトンインスタンスを作成するファクトリー関数
 */
let instance: UnifiedSummaryService | null = null;

export function getUnifiedSummaryService(apiKey?: string): UnifiedSummaryService {
  if (!instance) {
    instance = new UnifiedSummaryService(apiKey);
  }
  return instance;
}