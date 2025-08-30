import { ExternalAPIError } from '../errors';
import fetch from 'node-fetch';
import { cleanSummary as cleanSummaryUtil, cleanDetailedSummary as cleanDetailedSummaryUtil } from '../utils/summary-cleaner';

interface LocalLLMConfig {
  url: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  maxContentLength?: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LocalLLMClient {
  private config: LocalLLMConfig;

  constructor(config: LocalLLMConfig) {
    this.config = {
      maxTokens: parseInt(process.env.LOCAL_LLM_MAX_TOKENS || '800'),
      temperature: 0.3,
      maxContentLength: parseInt(process.env.LOCAL_LLM_MAX_CONTENT_LENGTH || '8000'),
      ...config,
    };
  }

  async generateSummary(title: string, content: string): Promise<string> {
    try {
      const prompt = this.createSummaryPrompt(title, content);
      const response = await this.callAPI([
        { role: 'user', content: prompt }
      ]);
      
      return this.cleanSummary(response);
    } catch (_error) {
      throw new ExternalAPIError(
        'LocalLLM',
        `Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async generateSummaryWithTags(title: string, content: string): Promise<{ summary: string; tags: string[] }> {
    try {
      const prompt = this.createSummaryAndTagsPrompt(title, content);
      const response = await this.callAPI([
        { role: 'user', content: prompt }
      ]);
      
      return this.parseSummaryAndTags(response);
    } catch (_error) {
      throw new ExternalAPIError(
        'LocalLLM',
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
      const response = await this.callAPI([
        { role: 'user', content: prompt }
      ]);
      
      return this.parseDetailedSummary(response);
    } catch (_error) {
      throw new ExternalAPIError(
        'LocalLLM',
        `Failed to generate detailed summary: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  private async callAPI(messages: ChatMessage[]): Promise<string> {
    // 日本語応答を促すシステムメッセージを追加
    const systemMessage: ChatMessage = {
      role: 'system',
      content: 'あなたは日本語で応答する技術記事分析アシスタントです。すべての応答は日本語で行ってください。技術用語は適切な日本語またはカタカナ表記を使用してください。思考過程や文字数カウントは出力せず、要求された内容のみを出力してください。'
    };
    
    const messagesWithSystem = [systemMessage, ...messages];
    
    const response = await fetch(`${this.config.url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messagesWithSystem,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from Local LLM');
    }

    return data.choices[0].message.content;
  }

  private createSummaryPrompt(title: string, content: string): string {
    const truncatedContent = content.substring(0, this.config.maxContentLength || 8000);
    
    return `以下の技術記事を必ず日本語で60-80文字に要約してください。

重要な指示:
- 必ず日本語で回答してください
- 60-80文字の範囲で簡潔にまとめてください  
- 著者の自己紹介は除外してください
- 記事の技術的な内容のみを含めてください
- 文章は必ず「。」で終わってください
- 思考過程や文字数カウントを出力しないでください
- 要約のみを出力してください

タイトル: ${title}
内容: ${truncatedContent}

日本語での要約:`;
  }

  private createSummaryAndTagsPrompt(title: string, content: string): string {
    // タグ生成には少し多めの内容を使用
    const maxLength = Math.min((this.config.maxContentLength || 8000) + 2000, 10000);
    const truncatedContent = content.substring(0, maxLength);
    
    return `技術記事を日本語で分析してください。

タイトル: ${title}
内容: ${truncatedContent}

以下の形式で出力してください（思考過程は出力しないこと）：

要約: [必ず日本語で60-80文字でまとめる]
タグ: [日本語またはカタカナで3-5個、カンマ区切り]

注意事項:
- 要約は記事の技術的内容を簡潔にまとめる
- 文末は必ず「。」で終える
- タグは技術名（JavaScript、Python等）とカテゴリ（フロントエンド、バックエンド等）を含める
- 思考過程や文字数カウントは出力しない
- 指定された形式のみ出力する`;
  }

  private createDetailedSummaryPrompt(title: string, content: string): string {
    // 詳細要約用にはより多くの内容を使用
    const maxLength = Math.min((this.config.maxContentLength || 8000) + 4000, 12000);
    const truncatedContent = content.substring(0, maxLength);
    
    return `以下の技術記事を詳細に分析して、日本語で要約、詳細要約、タグを生成してください。

タイトル: ${title}
記事内容: ${truncatedContent}

必ず以下の形式で出力してください：

要約: [60-80文字の日本語で、記事の主要なポイントを簡潔にまとめてください]

詳細要約:
・記事の主題は、[技術的背景と使用技術、前提知識を50-150文字で説明]
・具体的な問題は、[解決しようとしている問題と現状の課題を50-150文字で説明]
・提示されている解決策は、[技術的アプローチ、アルゴリズム、設計パターン等を50-150文字で説明]
・実装方法の詳細については、[具体的なコード例、設定方法、手順を50-150文字で説明]
・期待される効果は、[性能改善の指標（数値があれば含める）を50-150文字で説明]
・実装時の注意点は、[制約事項、必要な環境を50-150文字で説明]

タグ: [関連する技術タグを3-5個、カンマ区切りで出力]

重要な注意事項：
- 必ず6項目すべてを出力してください
- 各項目は「・」で始めてください
- 思考過程や説明は出力しないでください
- 日本語で回答してください`;
  }

  private cleanSummary(summary: string): string {
    // 共通のクリーンアップユーティリティを使用
    let cleaned = cleanSummaryUtil(summary);
    
    // LocalLLM特有の英語思考過程を除去
    const englishThinkingPatterns = [
      /^.*?(?:need|let's|count|chars?|craft).*?(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF])/gi,
      /^[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]*[a-zA-Z][^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]*(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF])/g
    ];
    
    for (const pattern of englishThinkingPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    return cleaned.trim();
  }

  private parseSummaryAndTags(text: string): { summary: string; tags: string[] } {
    // 英語の思考過程を含む行を除去
    const cleanedText = text.split('\n')
      .filter(line => {
        // 英語の思考過程パターンを検出
        const hasEnglishThinking = /^.*?(?:need|let's|count|chars?|craft|summary|tags).*$/i.test(line);
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(line);
        // 英語の思考過程があり、かつ日本語が含まれない行は除外
        return !(hasEnglishThinking && !hasJapanese);
      })
      .join('\n');
    
    const lines = cleanedText.split('\n');
    let summary = '';
    let tags: string[] = [];

    for (const line of lines) {
      if (line.startsWith('要約:') || line.startsWith('要約：')) {
        summary = this.cleanSummary(line.replace(/^要約[:：]\s*/, ''));
      } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
        const tagLine = line.replace(/^タグ[:：]\s*/, '');
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30)
          .map(tag => this.normalizeTag(tag));
      }
    }

    if (!summary) {
      // 最初の日本語文を探す
      const japaneseLines = lines.filter(line => 
        /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(line) && 
        line.trim().length > 0
      );
      if (japaneseLines.length > 0) {
        summary = this.cleanSummary(japaneseLines[0]);
      } else {
        // 文字数制限を200文字に拡張
        const maxLength = 200;
        let truncatedText = text.substring(0, maxLength);
        
        // 最後の句点で切る
        const lastPeriod = truncatedText.lastIndexOf('。');
        if (lastPeriod > 0) {
          truncatedText = truncatedText.substring(0, lastPeriod + 1);
        }
        
        summary = this.cleanSummary(truncatedText);
      }
    }

    return { summary, tags };
  }

  private parseDetailedSummary(text: string): { summary: string; detailedSummary: string; tags: string[] } {
    const lines = text.split('\n');
    let summary = '';
    let detailedSummary = '';
    let tags: string[] = [];
    let isDetailedSummary = false;
    const detailedSummaryLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('要約:') || line.startsWith('要約：')) {
        // 要約行の内容を取得（複数行にまたがる可能性があるため、次の区切りまで読む）
        const summaryContent = line.replace(/^要約[:：]\s*/, '');
        summary = this.cleanSummary(summaryContent);
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
      } else if (summary === '' && !isDetailedSummary && !line.startsWith('詳細要約') && !line.startsWith('タグ') && line.trim() !== '') {
        // 要約が複数行にまたがっている場合の続き
        summary = summary + ' ' + this.cleanSummary(line);
      }
    }

    // 詳細要約の組み立て
    if (detailedSummaryLines.length > 0) {
      detailedSummary = detailedSummaryLines.join('\n');
    }

    // フォールバック
    if (!summary || summary.length < 30) {
      // テキスト全体から要約らしき部分を探す
      const summaryMatch = text.match(/要約[:：]?\s*([^\n]+(?:\n[^・詳細要約タグ][^\n]*)*)/i);
      if (summaryMatch) {
        summary = this.cleanSummary(summaryMatch[1]);
      } else {
        // それでも見つからない場合は最初の文を使用（200文字まで）
        const maxLength = 200;
        let truncatedText = text.split('\n')[0].substring(0, maxLength);
        
        // 最後の句点で切る
        const lastPeriod = truncatedText.lastIndexOf('。');
        if (lastPeriod > 0) {
          truncatedText = truncatedText.substring(0, lastPeriod + 1);
        }
        
        summary = this.cleanSummary(truncatedText);
      }
    }
    
    // 要約が途切れている場合の処理
    if (summary && (summary.endsWith('。') === false || summary.length < 50)) {
      // 最後が句点でない、または短すぎる場合は補完を試みる
      if (!summary.endsWith('。')) {
        summary = summary + '。';
      }
    }
    if (!detailedSummary) {
      // フォールバック: より意味のある内容を生成
      const bulletPoints: string[] = [];
      bulletPoints.push(`・記事の主題: ${summary}`);
      if (tags.length > 0) {
        bulletPoints.push(`・関連技術: ${tags.slice(0, 3).join('、')}`);
      }
      bulletPoints.push(`・詳細は記事本文をご確認ください`);
      detailedSummary = bulletPoints.join('\n');
    }

    return { summary, detailedSummary, tags };
  }

  private normalizeTag(tag: string): string {
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

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.url}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      return response.ok;
    } catch (_error) {
      return false;
    }
  }
}