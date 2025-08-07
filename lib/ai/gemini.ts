import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { GEMINI_API } from '../constants';
import { ExternalAPIError } from '../errors';

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

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
      throw new ExternalAPIError(
        'Gemini',
        `Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async generateSummaryWithTags(title: string, content: string): Promise<{ summary: string; tags: string[] }> {
    try {
      const prompt = this.createSummaryAndTagsPrompt(title, content);
      
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: GEMINI_API.MAX_TOKENS,
          temperature: GEMINI_API.TEMPERATURE,
        },
      });

      const response = result.response;
      const text = response.text();
      
      return this.parseSummaryAndTags(text);
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new ExternalAPIError(
        'Gemini',
        `Failed to generate summary and tags: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async generateDetailedSummary(
    title: string,
    content: string
  ): Promise<{ summary: string; detailedSummary: string; tags: string[] }> {
    try {
      const prompt = this.createDetailedSummaryPrompt(title, content);
      
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1500, // 詳細要約は長いため増やす
          temperature: GEMINI_API.TEMPERATURE,
        },
      });

      const response = result.response;
      const text = response.text();
      
      return this.parseDetailedSummary(text);
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new ExternalAPIError(
        'Gemini',
        `Failed to generate detailed summary: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
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
    let cleaned = summary
      .trim()
      .replace(/^(要約|日本語要約)[:：]\s*/i, '') // Remove "要約:" or "日本語要約:" prefix if present
      .replace(/^(本記事は|本稿では|記事では|この記事は|本文では|この文書は)/g, '') // Remove article prefixes
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim(); // Remove any trailing spaces
    
    // 句読点が文頭にある場合は削除
    cleaned = cleaned.replace(/^[、。,\.]\s*/, '');
    
    // 文末に句点がない場合は追加
    if (cleaned && !cleaned.match(/[。.!?]$/)) {
      cleaned += '。';
    }
    
    return cleaned;
  }

  private createSummaryAndTagsPrompt(title: string, content: string): string {
    // Limit content length to avoid token limits
    const truncatedContent = content.substring(0, 3000);
    
    return `以下の技術記事を詳細に分析してください。

タイトル: ${title}
内容: ${truncatedContent}

以下の観点で分析し、指定された形式で回答してください：

【分析観点】
1. 記事の主要なトピックと技術的な焦点
2. 解決しようとしている問題や課題
3. 提示されている解決策やアプローチ
4. 実装の具体例やコードの有無
5. 対象読者のレベル（初級/中級/上級）

【回答形式】

要約: [60-80文字の日本語で、以下の要素を含めて簡潔にまとめる]
- 何について説明しているか（主題）
- どのような問題を解決するか、または何を実現するか
- 重要な技術やツールがあれば言及
- 著者の自己紹介や前置きは除外
- 「本記事は」「本稿では」などの枕詞は使わない
- 文頭に句読点を置かない
- 必ず「。」で終わる
- 例: ReactとTypeScriptを用いたカスタムフックの実装方法を解説し、状態管理の複雑さを軽減する実践的なアプローチを提供する。

タグ: [記事の内容を正確に表す技術タグを3-5個、カンマ区切りで記載]
- 使用されている主要な技術・言語・フレームワーク
- 記事のカテゴリ（例: フロントエンド, バックエンド, インフラ, セキュリティ, AI/ML）
- 具体的な技術概念（例: 非同期処理, 状態管理, CI/CD, マイクロサービス）
- 一般的な技術用語を使用（JavaScript→JavaScript, typescript→TypeScript）
- 取得元情報はタグに含めない

【タグの例】
- プログラミング言語: JavaScript, TypeScript, Python, Go, Rust, Ruby, Java
- フレームワーク: React, Vue.js, Next.js, Django, Express, Spring Boot
- インフラ/クラウド: AWS, Docker, Kubernetes, Terraform, CI/CD
- 概念: API設計, パフォーマンス最適化, セキュリティ, テスト, アーキテクチャ`;
  }

  private parseSummaryAndTags(text: string): { summary: string; tags: string[] } {
    const lines = text.split('\n');
    let summary = '';
    let tags: string[] = [];

    for (const line of lines) {
      if (line.startsWith('要約:') || line.startsWith('要約：')) {
        summary = this.cleanSummary(line.replace(/^要約[:：]\s*/, ''));
      } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
        const tagLine = line.replace(/^タグ[:：]\s*/, '');
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30) // 空タグと長すぎるタグを除外
          .map(tag => this.normalizeTag(tag));
      }
    }

    // フォールバック
    if (!summary) {
      summary = this.cleanSummary(text.substring(0, 100));
    }

    return { summary, tags };
  }

  private createDetailedSummaryPrompt(title: string, content: string): string {
    // コンテンツを適切な長さに制限
    const truncatedContent = content.substring(0, 4000);
    
    return `以下の技術記事を詳細に分析して、要約、詳細要約、タグを生成してください。

タイトル: ${title}
記事内容: ${truncatedContent}

出力形式:
要約: [60-80文字の日本語で、記事の主要なポイントを簡潔にまとめてください]

詳細要約:
・記事の主題は、[技術的背景と使用技術、前提知識を50-150文字で説明]
・具体的な問題は、[解決しようとしている問題と現状の課題を50-150文字で説明]
・提示されている解決策は、[技術的アプローチ、アルゴリズム、設計パターン等を50-150文字で説明]
・実装方法の詳細については、[具体的なコード例、設定方法、手順を50-150文字で説明]
・期待される効果は、[性能改善の指標（数値があれば含める）を50-150文字で説明]
・実装時の注意点は、[制約事項、必要な環境を50-150文字で説明]

タグ: [関連する技術タグを3-5個、カンマ区切りで出力]`;
  }

  private parseDetailedSummary(text: string): { summary: string; detailedSummary: string; tags: string[] } {
    const lines = text.split('\n');
    let summary = '';
    let detailedSummary = '';
    let tags: string[] = [];
    let isDetailedSummary = false;
    let detailedSummaryLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('要約:') || line.startsWith('要約：')) {
        summary = this.cleanSummary(line.replace(/^要約[:：]\s*/, ''));
        isDetailedSummary = false;
      } else if (line.startsWith('詳細要約:') || line.startsWith('詳細要約：')) {
        isDetailedSummary = true;
      } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
        isDetailedSummary = false;
        const tagLine = line.replace(/^タグ[:：]\s*/, '');
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30)
          .map(tag => this.normalizeTag(tag));
      } else if (isDetailedSummary && line.trim().startsWith('・')) {
        detailedSummaryLines.push(line.trim());
      }
    }

    // 詳細要約の組み立て
    if (detailedSummaryLines.length > 0) {
      detailedSummary = detailedSummaryLines.join('\n');
    }

    // フォールバック
    if (!summary) {
      summary = this.cleanSummary(text.substring(0, 100));
    }
    if (!detailedSummary) {
      // フォールバック: 簡単な形式を生成（ラベルなし）
      detailedSummary = `・${summary}\n・記事内のコード例や手順を参照してください。\n・タグ: ${tags.join(', ')}`;
    }

    return { summary, detailedSummary, tags };
  }

  private normalizeTag(tag: string): string {
    // タグの正規化マップ
    const tagNormalizationMap: Record<string, string> = {
      'javascript': 'JavaScript',
      'js': 'JavaScript',
      'typescript': 'TypeScript',
      'ts': 'TypeScript',
      'react': 'React',
      'vue': 'Vue.js',
      'angular': 'Angular',
      'node': 'Node.js',
      'nodejs': 'Node.js',
      'python': 'Python',
      'docker': 'Docker',
      'kubernetes': 'Kubernetes',
      'k8s': 'Kubernetes',
      'aws': 'AWS',
      'gcp': 'GCP',
      'azure': 'Azure',
      'ai': 'AI',
      'ml': '機械学習',
      'github': 'GitHub',
      'git': 'Git',
    };

    const lowerTag = tag.toLowerCase();
    return tagNormalizationMap[lowerTag] || tag;
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