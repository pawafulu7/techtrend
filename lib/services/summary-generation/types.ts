/**
 * 要約生成サービスの型定義
 */

/**
 * 要約生成オプション
 */
export interface SummaryGenerationOptions {
  /** 再生成フラグ */
  isRegeneration?: boolean;
  /** 最大リトライ回数 */
  maxRetries?: number;
  /** リトライ間隔（ミリ秒） */
  retryDelay?: number;
  /** 要約の最小文字数 */
  minLength?: number;
  /** 要約の最大文字数 */
  maxLength?: number;
  /** 詳細要約を生成するか */
  generateDetailed?: boolean;
  /** デバッグモード */
  debug?: boolean;
}

/**
 * 要約生成結果
 */
export interface SummaryResult {
  /** 基本要約（100-150文字） */
  summary: string;
  /** 詳細要約（箇条書き形式） */
  detailedSummary?: string;
  /** 抽出されたタグ */
  tags: string[];
  /** 品質スコア（0-100） */
  qualityScore?: number;
  /** 生成にかかった時間（ミリ秒） */
  processingTime?: number;
  /** エラーメッセージ */
  error?: string;
}

/**
 * AI APIの応答
 */
export interface AIResponse {
  /** 生成されたテキスト */
  text: string;
  /** 使用トークン数 */
  tokens?: number;
  /** モデル名 */
  model?: string;
  /** 生成時間 */
  generationTime?: number;
}

/**
 * バッチ処理のオプション
 */
export interface BatchProcessingOptions {
  /** バッチサイズ */
  batchSize?: number;
  /** 並列処理数 */
  concurrency?: number;
  /** 進捗コールバック */
  onProgress?: (current: number, total: number) => void;
  /** エラーコールバック */
  onError?: (error: Error, item: any) => void;
  /** 成功コールバック */
  onSuccess?: (result: SummaryResult, item: any) => void;
}

/**
 * 記事データ（要約生成用）
 */
export interface ArticleData {
  /** 記事ID */
  id: string;
  /** 記事タイトル */
  title: string;
  /** 記事本文 */
  content: string;
  /** 記事URL */
  url?: string;
  /** ソースID */
  sourceId?: string;
  /** 公開日 */
  publishedAt?: Date;
  /** 現在の要約 */
  currentSummary?: string;
  /** 現在のタグ */
  currentTags?: string[];
}

/**
 * 要約品質メトリクス
 */
export interface QualityMetrics {
  /** 文字数スコア */
  lengthScore: number;
  /** キーワード含有率 */
  keywordDensity: number;
  /** 可読性スコア */
  readabilityScore: number;
  /** 文法正確性 */
  grammarScore: number;
  /** 総合スコア */
  totalScore: number;
}

/**
 * Rate Limit設定
 */
export interface RateLimitConfig {
  /** 1分あたりのリクエスト数上限 */
  requestsPerMinute: number;
  /** 1日あたりのリクエスト数上限 */
  requestsPerDay?: number;
  /** Rate Limit到達時の待機時間（ミリ秒） */
  waitTime: number;
  /** 自動リトライ */
  autoRetry: boolean;
}