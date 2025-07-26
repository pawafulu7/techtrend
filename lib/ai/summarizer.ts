import { GeminiClient } from './gemini';

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

  constructor(apiKey: string) {
    this.geminiClient = new GeminiClient(apiKey);
  }

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

  async summarizeBatch(
    articles: Array<{ id: string; title: string; content: string }>
  ): Promise<Map<string, string>> {
    const summaries = new Map<string, string>();
    
    // Process all articles through the queue
    const promises = articles.map(article => 
      this.summarize(article.id, article.title, article.content)
        .then(summary => summaries.set(article.id, summary))
        .catch(error => console.error(`Failed to summarize article ${article.id}:`, error))
    );

    await Promise.all(promises);
    
    return summaries;
  }
}