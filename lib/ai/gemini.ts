import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API } from '@/lib/constants';

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: GEMINI_API.MODEL,
    });
  }

  async generateSummary(title: string, content: string): Promise<string> {
    try {
      const prompt = this.createSummaryPrompt(title, content);
      
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: GEMINI_API.MAX_TOKENS,
          temperature: GEMINI_API.TEMPERATURE,
        },
      });

      const response = await result.response;
      const summary = response.text();
      
      return this.cleanSummary(summary);
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createSummaryPrompt(title: string, content: string): string {
    // Limit content length to avoid token limits
    const truncatedContent = content.substring(0, 2000);
    
    return `以下の技術記事を60-80文字の日本語で要約してください。著者の自己紹介は除外し、記事の技術的な内容のみを簡潔にまとめてください。文章は必ず「。」で終わるようにしてください。

タイトル: ${title}
内容: ${truncatedContent}`;
  }

  private cleanSummary(summary: string): string {
    return summary
      .trim()
      .replace(/^(要約|日本語要約)[:：]\s*/i, '') // Remove "要約:" or "日本語要約:" prefix if present
      .replace(/^(本記事は|本稿では|記事では|この記事は)/g, '') // Remove article prefixes
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim(); // Remove any trailing spaces
  }

  async batchGenerateSummaries(
    articles: Array<{ title: string; content: string }>
  ): Promise<Map<number, string>> {
    const summaries = new Map<number, string>();
    
    // Process in batches to respect rate limits
    const batchSize = 5;
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (article, index) => {
          try {
            const summary = await this.generateSummary(article.title, article.content || '');
            summaries.set(i + index, summary);
          } catch (error) {
            console.error(`Failed to generate summary for article ${i + index}:`, error);
            // Continue with other articles even if one fails
          }
        })
      );
      
      // Wait between batches to avoid rate limiting
      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return summaries;
  }
}