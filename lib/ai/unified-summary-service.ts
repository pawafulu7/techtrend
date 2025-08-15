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
  summaryVersion: 6;
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
  private static readonly SUMMARY_VERSION = 7;
  private static readonly ARTICLE_TYPE = 'unified' as const;
  private static readonly DEFAULT_OPTIONS: GenerateOptions = {
    maxRetries: 3,
    retryDelay: 5000,
    minQualityScore: 40,
    contentMaxLength: 150000  // Gemini 1.5 Flashの能力を活用、150,000文字まで対応
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
    
    // 500文字以下の記事は詳細要約をスキップし、要約のみ生成
    // 注意: 前処理後のコンテンツ長で判定する（前処理で短縮される可能性があるため）
    const skipDetailedSummary = processedContent.length <= 500;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= opts.maxRetries!; attempt++) {
      try {
        // プロンプト生成（500文字以下の場合は要約のみ）
        const prompt = skipDetailedSummary
          ? this.generateSummaryOnlyPrompt(title, processedContent)
          : generateUnifiedPrompt(title, processedContent);
        
        // API呼び出し
        const responseText = await this.callGeminiAPI(prompt);
        
        // 500文字以下の記事の場合は特別処理
        if (skipDetailedSummary) {
          // 要約のみのレスポンスをパース
          const summaryMatch = responseText.match(/要約[:：]\s*([\s\S]+?)(?:\n\n|タグ[:：]|$)/);
          const tagsMatch = responseText.match(/タグ[:：]\s*([\s\S]+?)(?:\n|$)/);
          
          const summary = summaryMatch ? summaryMatch[1].trim() : responseText.split('\n')[0].trim();
          const tagsString = tagsMatch ? tagsMatch[1].trim() : '';
          const tags = tagsString ? tagsString.split(/[,、]/).map(t => t.trim()).filter(Boolean) : [];
          
          return {
            summary,
            detailedSummary: '__SKIP_DETAILED_SUMMARY__',
            tags,
            articleType: UnifiedSummaryService.ARTICLE_TYPE,
            summaryVersion: UnifiedSummaryService.SUMMARY_VERSION,
            qualityScore: 100
          };
        }
        
        // レスポンスのパース
        console.log('[UnifiedSummaryService] レスポンス受信:', responseText.length, '文字');
        const parsed = parseUnifiedResponse(responseText);
        console.log('[UnifiedSummaryService] パース結果 - 詳細要約:', parsed.detailedSummary.substring(0, 100));
        
        // 検証
        if (!validateParsedResult(parsed)) {
          console.log('[UnifiedSummaryService] 検証失敗 - 詳細要約長:', parsed.detailedSummary.length);
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
    // PDFファイルの場合（URLが.pdfで終わる、またはPDFバイナリを含む）
    if (sourceInfo?.url?.toLowerCase().endsWith('.pdf') || 
        content.includes('%PDF-') || 
        content.includes('%%EOF')) {
      console.log(`[UnifiedSummaryService] PDFファイルを検出、要約生成をスキップ: ${sourceInfo?.url}`);
      // PDFは要約生成不可
      return '__SKIP_SUMMARY_GENERATION__';
    }
    
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
          maxOutputTokens: 2500,  // 詳細要約に対応した統一設定
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

  /**
   * 要約のみ生成するプロンプト（500文字以下の記事用）
   */
  private generateSummaryOnlyPrompt(title: string, content: string): string {
    return `以下の短い技術記事を簡潔に要約してください。

【ルール】
1. 要約は100-150文字程度（最大200文字以内）
2. 記事の内容を端的に表現
3. 技術用語は略称を活用（JavaScript→JS、TypeScript→TS等）
4. 必ず句点で終了
5. 前置き文言を使わず、内容から始める

要約:
記事の主要内容を100-150文字で簡潔に説明。

タグ:
技術名を5個まで（カンマ区切り、一般的な略称を使用）

タイトル: ${title}
内容: ${content}`;
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