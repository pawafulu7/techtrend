/**
 * 統一要約生成サービス
 * 全ての要約生成処理で使用する統一インターフェース
 */

import fetch from 'node-fetch';
import { generateEnhancedUnifiedPrompt } from '../utils/article/article-type-prompts';
import {
  parseUnifiedResponse,
  validateParsedResult,
  ParsedSummaryResult,
} from './unified-summary-parser';
import { checkSummaryQuality } from '../utils/summary/summary-quality-checker';
import { isUrlFromDomain } from '@/lib/utils/url/url-validator';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import { logger } from '@/lib/logger';
import { env } from '@/lib/config/env';

export interface UnifiedSummaryResult extends ParsedSummaryResult {
  articleType: 'unified';
  summaryVersion: number;
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
  private static readonly SUMMARY_VERSION = 8;
  private static readonly ARTICLE_TYPE = 'unified' as const;
  private static readonly DEFAULT_OPTIONS: GenerateOptions = {
    maxRetries: 3,
    retryDelay: 5000,
    minQualityScore: 40,
    contentMaxLength: 150000, // Gemini 1.5 Flashの能力を活用、150,000文字まで対応
  };

  private apiKey: string;
  private apiUrl: string;
  private embeddingScheduler: EmbeddingScheduler;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    this.embeddingScheduler = new EmbeddingScheduler();
  }

  /**
   * 要約を生成
   */
  async generate(
    title: string,
    content: string,
    options?: GenerateOptions,
    sourceInfo?: { sourceName?: string; url?: string },
    articleId?: string
  ): Promise<UnifiedSummaryResult> {
    const opts = { ...UnifiedSummaryService.DEFAULT_OPTIONS, ...options };

    // コンテンツの前処理
    const processedContent = this.preprocessContent(
      title,
      content,
      opts.contentMaxLength!,
      sourceInfo
    );

    // スキップマーカーのチェック
    if (processedContent.startsWith('__SKIP_SUMMARY_GENERATION__')) {
      const parts = processedContent.split(':');
      const reason = parts[1] || 'UNKNOWN';

      const messages: Record<string, string> = {
        PDF: 'PDFファイルのため要約生成をスキップします',
        SLIDE: 'スライド資料のため要約生成をスキップします',
        THIN_CONTENT:
          'コンテンツ不足（< 300文字）のため要約生成をスキップします',
      };

      throw new Error(
        `SKIP_GENERATION:${reason}: ${messages[reason] || reason}`
      );
    }

    // 元記事の長さを保存（前処理前）
    const rawLength = content.length;
    const rawWordCount = content.trim().split(/\s+/).length;

    // 100文字以下の極端に短い記事のみ詳細要約をスキップ
    // タイトルと合わせて最低限の情報があれば要約を生成する
    const skipDetailedSummary = rawLength <= 100 && rawWordCount < 20; // 元記事の長さで判定

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= opts.maxRetries!; attempt++) {
      try {
        // プロンプト生成（100文字以下かつ単語数が少ない場合のみ要約のみ）
        let prompt: string;
        if (skipDetailedSummary) {
          prompt = this.generateSummaryOnlyPrompt(title, processedContent);
        } else if (processedContent.length <= 500) {
          // 100-500文字の短いコンテンツ用の特別なプロンプト
          prompt = this.generateShortContentPrompt(title, processedContent);
        } else {
          // 改善版プロンプトを使用（カテゴリとタグ正規化対応）
          prompt = generateEnhancedUnifiedPrompt(title, processedContent);
        }

        // API呼び出し
        const responseText = await this.callGeminiAPI(prompt);

        // 極端に短い記事の場合は特別処理
        if (skipDetailedSummary) {
          // 要約のみのレスポンスをパース
          const summaryMatch = responseText.match(
            /要約[:：]\s*([\s\S]+?)(?:\n\n|タグ[:：]|$)/
          );
          const tagsMatch = responseText.match(
            /タグ[:：]\s*([\s\S]+?)(?:\n|$)/
          );

          const summary = summaryMatch
            ? summaryMatch[1].trim()
            : responseText.split('\n')[0].trim();
          const tagsString = tagsMatch ? tagsMatch[1].trim() : '';
          const tags = tagsString
            ? tagsString
                .split(/[,、]/)
                .map((t) => t.trim())
                .filter(Boolean)
            : [];

          return {
            summary,
            detailedSummary: '__SKIP_DETAILED_SUMMARY__',
            tags,
            articleType: UnifiedSummaryService.ARTICLE_TYPE,
            summaryVersion: UnifiedSummaryService.SUMMARY_VERSION,
            qualityScore: 100,
          };
        }

        // レスポンスのパース
        const parsed = parseUnifiedResponse(responseText);

        // 検証
        if (!validateParsedResult(parsed)) {
          throw new Error('Invalid parsed result');
        }

        // postProcessSummariesをインポートして適用
        const { postProcessSummaries } =
          await import('../utils/summary/summary-post-processor');
        const processed = postProcessSummaries(
          parsed.summary,
          parsed.detailedSummary
        );

        // コンテンツ分析情報を作成（項目数チェック用）
        // 注意：品質チェックには元記事の長さを使用（前処理前）
        const contentAnalysis = {
          contentLength: rawLength, // 元記事の長さを使用
          totalLength: rawLength, // 互換性のため両方定義
          isThinContent: rawLength < 1000,
          recommendedMinLength: rawLength < 1000 ? 60 : 100,
          recommendedMaxLength: rawLength < 1000 ? 100 : 200,
        };

        // 品質チェック（処理後のテキストで実施、コンテンツ分析情報も渡す）
        const qualityResult = checkSummaryQuality(
          processed.summary,
          processed.detailedSummary,
          contentAnalysis
        );
        const qualityScore = qualityResult.score;

        // 項目数不足の場合はログを出力
        if (qualityResult.itemCountValid === false) {
          logger.warn(
            {
              itemCount: qualityResult.itemCount,
              titlePreview: title.substring(0, 50),
              contentLength: content.length,
            },
            'Summary item count insufficient'
          );
        }

        // 品質スコアが閾値以下または項目数不足の場合、再試行
        if (
          qualityScore < opts.minQualityScore! ||
          qualityResult.itemCountValid === false
        ) {
          if (attempt < opts.maxRetries!) {
            if (qualityResult.itemCountValid === false) {
              logger.info(
                { attempt: attempt + 1, maxRetries: opts.maxRetries },
                'Retrying due to insufficient item count'
              );
            }
            await this.delay(opts.retryDelay!);
            continue;
          }
          // 最終試行でも基準未達 → 明示的に失敗扱い
          throw new Error('品質基準未達');
        }

        // Schedule embedding job if articleId provided
        if (articleId) {
          try {
            await this.embeddingScheduler.enqueue(articleId);
            logger.debug({ articleId }, 'Embedding job enqueued');
          } catch (err) {
            logger.error(
              {
                articleId,
                err: err,
              },
              'Failed to enqueue embedding job'
            );
            // Don't throw - summary generation should succeed even if enqueue fails
          }
        }

        // 結果を返す（postProcessSummariesで処理済みのテキストを使用）
        return {
          summary: processed.summary,
          detailedSummary: processed.detailedSummary,
          tags: parsed.tags,
          category: parsed.category, // カテゴリを追加
          articleType: UnifiedSummaryService.ARTICLE_TYPE,
          summaryVersion: UnifiedSummaryService.SUMMARY_VERSION,
          qualityScore,
        };
      } catch (_error) {
        lastError = _error as Error;

        // Rate limitエラーの場合は長めに待機
        if (this.isRateLimitError(_error)) {
          await this.delay(opts.retryDelay! * 3);
        } else if (attempt < opts.maxRetries!) {
          await this.delay(opts.retryDelay!);
        }
      }
    }

    // リトライ上限到達時のエラー詳細化
    if (lastError?.message && lastError.message.includes('品質基準未達')) {
      throw new Error(
        `QUALITY_FAILED: 品質基準未達（試行回数: ${opts.maxRetries}）`
      );
    }
    throw new Error(
      `Failed to generate summary after ${opts.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * レスポンステキストをパース（公開メソッド）
   */
  parseResponse(text: string): UnifiedSummaryResult {
    const parsed = parseUnifiedResponse(text);
    const qualityScore = checkSummaryQuality(
      parsed.summary,
      parsed.detailedSummary
    ).score;

    return {
      ...parsed,
      articleType: UnifiedSummaryService.ARTICLE_TYPE,
      summaryVersion: UnifiedSummaryService.SUMMARY_VERSION,
      qualityScore,
    };
  }

  /**
   * 結果の検証（公開メソッド）
   */
  validateResult(result: UnifiedSummaryResult): boolean {
    return (
      validateParsedResult(result) &&
      result.summaryVersion === UnifiedSummaryService.SUMMARY_VERSION &&
      result.articleType === UnifiedSummaryService.ARTICLE_TYPE
    );
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
  private preprocessContent(
    title: string,
    content: string,
    maxLength: number,
    sourceInfo?: { sourceName?: string; url?: string }
  ): string {
    // PDFファイルの場合（URLが.pdfで終わる、またはPDFバイナリを含む）
    if (
      sourceInfo?.url?.toLowerCase().endsWith('.pdf') ||
      content.includes('%PDF-') ||
      content.includes('%%EOF')
    ) {
      // PDFは要約生成不可
      return '__SKIP_SUMMARY_GENERATION__:PDF';
    }

    // スライド資料の場合（Speaker Deck、Docswell、SlideShare）
    // コンテンツが不足している場合はスキップ
    if (
      sourceInfo?.url &&
      (isUrlFromDomain(sourceInfo.url, 'speakerdeck.com') ||
        isUrlFromDomain(sourceInfo.url, 'docswell.com') ||
        isUrlFromDomain(sourceInfo.url, 'slideshare.net')) &&
      content.length < 500
    ) {
      // スライド資料は要約生成不可
      return '__SKIP_SUMMARY_GENERATION__:SLIDE';
    }

    // コンテンツが極端に不足している場合
    if (content.length < 300) {
      return '__SKIP_SUMMARY_GENERATION__:THIN_CONTENT';
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
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2500, // 詳細要約に対応した統一設定
          topP: 0.8,
          topK: 40,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  /**
   * Rate limitエラーかチェック
   */
  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('429') ||
      message.includes('rate') ||
      message.includes('quota') ||
      message.includes('503')
    );
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  /**
   * 短いコンテンツ用のプロンプト生成（100-500文字）
   * 一覧要約と詳細要約のバランスを考慮
   */
  private generateShortContentPrompt(title: string, content: string): string {
    const contentLength = content.length;

    // コンテンツ長に応じた項目数を設定
    let itemCount = '';

    if (contentLength <= 200) {
      itemCount = '2-3個';
    } else if (contentLength <= 350) {
      itemCount = '3個';
    } else {
      itemCount = '3-4個';
    }

    return `
以下の技術記事を分析し、日本語で要約を作成してください。

【重要な注意事項】
- この記事はコンテンツが短い（${contentLength}文字）ため、バランスを考慮して要約を作成してください
- 一覧要約は記事カードに収まる適度な長さ（100-150文字程度）にしてください
- 詳細要約は最大200文字以内で、記事に書かれている事実のみをまとめてください
- 推測や補完は行わず、記事の内容のみを要約してください

【出力形式】
要約: （記事の要点を簡潔にまとめた一覧表示用の要約）

詳細要約:
・項目名1：（具体的な内容、少なくとも50文字以上）
・項目名2：（具体的な内容、少なくとも50文字以上）
${itemCount === '2-3個' ? '（項目は2-3個で十分です）' : `（項目は${itemCount}程度）`}

タグ: （カンマ区切りで3-5個）

【記事情報】
タイトル: ${title}
内容: ${content}

【生成ガイドライン】
1. 記事に書かれている事実のみを要約する
2. 推測や一般的な知識での補完は行わない
3. 詳細要約は最大200文字以内に収める
4. 一覧要約と詳細要約で情報の重複を避け、相補的な内容にする
`;
  }
}

/**
 * シングルトンインスタンスを作成するファクトリー関数
 */
let instance: UnifiedSummaryService | null = null;

export function getUnifiedSummaryService(
  apiKey?: string
): UnifiedSummaryService {
  if (!instance) {
    instance = new UnifiedSummaryService(apiKey);
  }
  return instance;
}
