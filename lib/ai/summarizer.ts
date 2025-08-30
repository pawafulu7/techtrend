import { GeminiClient } from './gemini';
import { UnifiedSummaryResult, getUnifiedSummaryService } from './unified-summary-service';

export class ArticleSummarizer {
  private geminiClient: GeminiClient;
  private queue: Array<{
    id: string;
    title: string;
    content: string;
    resolve: (summary: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private processing = false;

  // 統一フォーマット用の新しいキュー
  private queueUnified: Array<{
    id: string;
    title: string;
    content: string;
    resolve: (result: UnifiedSummaryResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private processingUnified = false;

  constructor(apiKey: string) {
    this.geminiClient = new GeminiClient(apiKey);
  }

  /**
   * 統一フォーマットで要約を生成する新メソッド
   * @param id 記事ID
   * @param title 記事タイトル
   * @param content 記事内容
   * @returns 統一フォーマットの要約結果
   */
  async summarizeUnified(
    id: string, 
    title: string, 
    content: string
  ): Promise<UnifiedSummaryResult> {
    return new Promise((resolve, reject) => {
      this.queueUnified.push({ id, title, content, resolve, reject });
      this.processQueueUnified();
    });
  }

  /**
   * 統一フォーマット用のキュー処理
   */
  private async processQueueUnified() {
    if (this.processingUnified || this.queueUnified.length === 0) {
      return;
    }

    this.processingUnified = true;

    while (this.queueUnified.length > 0) {
      const item = this.queueUnified.shift();
      if (!item) continue;

      try {
        // UnifiedSummaryServiceを使用して要約を生成
        const service = getUnifiedSummaryService();
        const result = await service.generate(item.title, item.content, {
          maxRetries: 3,
          minQualityScore: 40
        });
        
        item.resolve(result);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }

      // Rate limiting: wait between requests
      if (this.queueUnified.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    this.processingUnified = false;
  }

  /**
   * @deprecated Use summarizeUnified() instead for unified format support
   * 
   * 旧形式の要約生成メソッド（非推奨）
   * 一覧要約のみを生成し、詳細要約や統一フォーマットには対応していません。
   * 新規実装では summarizeUnified() を使用してください。
   */
  async summarize(id: string, title: string, content: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, title, content, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;

      try {
        const summary = await this.geminiClient.generateSummary(
          item.title,
          item.content
        );
        item.resolve(summary);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }

      // Rate limiting: wait between requests
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    this.processing = false;
  }

  /**
   * 統一フォーマットでバッチ処理を行う新メソッド
   */
  async summarizeBatchUnified(
    articles: Array<{ id: string; title: string; content: string }>
  ): Promise<Map<string, UnifiedSummaryResult>> {
    const summaries = new Map<string, UnifiedSummaryResult>();
    
    // Process all articles through the unified queue
    const promises = articles.map(article => 
      this.summarizeUnified(article.id, article.title, article.content)
        .then(result => summaries.set(article.id, result))
    );

    await Promise.all(promises);
    
    return summaries;
  }

  /**
   * @deprecated Use summarizeBatchUnified() instead for unified format support
   */
  async summarizeBatch(
    articles: Array<{ id: string; title: string; content: string }>
  ): Promise<Map<string, string>> {
    const summaries = new Map<string, string>();
    
    // Process all articles through the queue
    const promises = articles.map(article => 
      this.summarize(article.id, article.title, article.content)
        .then(summary => summaries.set(article.id, summary))
    );

    await Promise.all(promises);
    
    return summaries;
  }
}