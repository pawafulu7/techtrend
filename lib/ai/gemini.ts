import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { GEMINI_API } from '../constants';
import { ExternalAPIError } from '../errors';
import { cleanSummary as cleanSummaryUtil, cleanDetailedSummary as cleanDetailedSummaryUtil } from '../utils/summary-cleaner';
import { validateSummary, cleanupSummary, validateAndNormalizeTags } from '../utils/summary-validator';
import { calculateSummaryScore, needsRegeneration } from '../utils/quality-scorer';
import { 
  createSummaryPrompt as createSummaryPromptNew,
  createDetailedSummaryPrompt as createDetailedSummaryPromptNew,
  postProcessSummary,
  validateSummaryQuality
} from './summary-generator';

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
      // 共通処理を使用してプロンプトを生成
      const prompt = createSummaryPromptNew(title, content);
      
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: GEMINI_API.MAX_TOKENS,
          temperature: GEMINI_API.TEMPERATURE,
        },
      });

      const response = await result.response;
      let summary = response.text();
      
      // クリーンアップ
      summary = this.cleanSummary(summary);
      
      // 後処理（文字数調整、前置き文言除去）
      summary = postProcessSummary(summary, 130);
      
      // 品質検証
      const validation = validateSummaryQuality(summary, 'normal');
      if (!validation.isValid) {
        console.warn('要約の品質に問題があります:', validation.errors);
      }
      
      return summary;
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new ExternalAPIError(
        'Gemini',
        `Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async generateSummaryWithTags(title: string, content: string, maxRetries: number = 1): Promise<{ summary: string; tags: string[] }> {
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
      
      const parsedResult = this.parseSummaryAndTags(text);
      
      // 品質チェックと再生成
      const score = calculateSummaryScore(parsedResult.summary, { tags: parsedResult.tags });
      if (needsRegeneration(score) && maxRetries > 0) {
        console.log(`要約品質が低い（${score.totalScore}点）、再生成を試みます...`);
        return this.generateSummaryWithTags(title, content, maxRetries - 1);
      }
      
      return parsedResult;
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
      // 共通処理を使用してプロンプトを生成
      const prompt = createDetailedSummaryPromptNew(title, content);
      
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1500, // 詳細要約は長いため増やす
          temperature: GEMINI_API.TEMPERATURE,
        },
      });

      const response = result.response;
      const text = response.text();
      
      const parsedResult = this.parseDetailedSummary(text);
      
      // 通常要約の後処理
      parsedResult.summary = postProcessSummary(parsedResult.summary, 130);
      
      // 品質検証
      const summaryValidation = validateSummaryQuality(parsedResult.summary, 'normal');
      const detailedValidation = validateSummaryQuality(parsedResult.detailedSummary, 'detailed');
      
      if (!summaryValidation.isValid) {
        console.warn('要約の品質に問題があります:', summaryValidation.errors);
      }
      
      if (!detailedValidation.isValid) {
        console.warn('詳細要約の品質に問題があります:', detailedValidation.errors);
      }
      
      return parsedResult;
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
    
    // 記事タイプを判定
    const articleType = detectArticleType(title, truncatedContent);
    
    // 記事タイプに応じた説明を生成
    const typeDescriptions: Record<ArticleType, string> = {
      'implementation': '個人開発・実装レポート',
      'tutorial': 'チュートリアル・学習ガイド',
      'problem-solving': '問題解決・技術改善',
      'tech-intro': '技術紹介・解説',
      'release': '新機能・リリース情報'
    };
    
    return `以下の${typeDescriptions[articleType]}記事を日本語で要約してください。

タイトル: ${title}
内容: ${truncatedContent}

重要な指示:
1. 100-120文字で要約（厳守：最大130文字まで）
2. 著者の自己紹介や前置きは除外
3. 記事が提供する価値や解決する問題を明確に含める
4. 具体的な技術名、数値、手法を含める
5. 必ず完全な文で終わる（「。」で終了）
6. 簡潔に、一文または二文で表現

絶対に守るべきルール:
- 「本記事は」「この記事では」「〜について解説」などの前置き文言を使わない
- 要約は記事の内容そのものから直接始める
- 「要約:」「要約：」などのラベルを付けない
- 要約内容のみを出力

記事タイプ別の重点:
${articleType === 'implementation' ? '- 作ったものと使用技術を明確に\n- 実装した機能や特徴を具体的に' : ''}
${articleType === 'tutorial' ? '- 学習内容と手順を具体的に\n- 対象技術とゴールを明確に' : ''}
${articleType === 'problem-solving' ? '- 解決した問題と解決策を明確に\n- 効果や改善点を具体的に' : ''}
${articleType === 'tech-intro' ? '- 技術の特徴と用途を説明\n- メリットや活用シーンを含める' : ''}
${articleType === 'release' ? '- 新機能と対象ユーザーを明確に\n- 主要な改善点や特徴を含める' : ''}

要約:`;
  }

  private cleanSummary(summary: string): string {
    // 共通のクリーンアップユーティリティを使用
    return cleanSummaryUtil(summary);
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
以下の形式で回答してください。「要約:」や「タグ:」などのラベルを含めて出力してください。

要約: [80-120文字の日本語で、以下の要素を含めて簡潔にまとめる]
- 何について説明しているか（主題）
- どのような問題を解決するか、または何を実現するか
- 重要な技術やツールがあれば言及
- 著者の自己紹介や前置きは除外
- 「本記事は」「本稿では」などの枕詞は使わない
- 文頭に句読点を置かない
- 必ず完全な文で終わる（「。」で終了）
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
        const rawSummary = line.replace(/^要約[:：]\s*/, '');
        summary = cleanupSummary(rawSummary);
      } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
        const tagLine = line.replace(/^タグ[:：]\s*/, '');
        const rawTags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .map(tag => this.normalizeTag(tag));
        tags = validateAndNormalizeTags(rawTags);
      }
    }

    // フォールバック
    if (!summary) {
      // 文字数制限を200文字に拡張し、完全な文で終わるようにする
      const maxLength = 200;
      let truncatedText = text.substring(0, maxLength);
      
      // 最後の句点で切る
      const lastPeriod = truncatedText.lastIndexOf('。');
      if (lastPeriod > 0) {
        truncatedText = truncatedText.substring(0, lastPeriod + 1);
      }
      
      summary = cleanupSummary(truncatedText);
    }
    
    // 要約の検証
    const validation = validateSummary(summary);
    if (!validation.isValid) {
      console.warn('要約の検証エラー:', validation.errors);
      // クリーンアップを試みる
      summary = cleanupSummary(summary);
    }

    // 品質スコアのチェック（再生成が必要な場合は警告）
    const score = calculateSummaryScore(summary, { tags });
    if (needsRegeneration(score)) {
      console.warn(`要約の品質が低い（${score.totalScore}点）: ${score.issues.join(', ')}`);
    }

    return { summary, tags };
  }

  private createDetailedSummaryPrompt(title: string, content: string): string {
    // コンテンツを適切な長さに制限
    const truncatedContent = content.substring(0, 4000);
    
    // 記事タイプを判定
    const articleType = detectArticleType(title, truncatedContent);
    
    // 記事タイプに応じた詳細プロンプトを生成
    return generatePromptForArticleType(articleType, title, truncatedContent);
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
        const rawSummary = line.replace(/^要約[:：]\s*/, '');
        summary = cleanupSummary(rawSummary);
        isDetailedSummary = false;
      } else if (line.startsWith('詳細要約:') || line.startsWith('詳細要約：')) {
        isDetailedSummary = true;
      } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
        isDetailedSummary = false;
        const tagLine = line.replace(/^タグ[:：]\s*/, '');
        const rawTags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .map(tag => this.normalizeTag(tag));
        tags = validateAndNormalizeTags(rawTags);
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
      // 文字数制限を200文字に拡張し、完全な文で終わるようにする
      const maxLength = 200;
      let truncatedText = text.substring(0, maxLength);
      
      // 最後の句点で切る
      const lastPeriod = truncatedText.lastIndexOf('。');
      if (lastPeriod > 0) {
        truncatedText = truncatedText.substring(0, lastPeriod + 1);
      }
      
      summary = cleanupSummary(truncatedText);
    }
    
    // 要約の検証
    const summaryValidation = validateSummary(summary);
    if (!summaryValidation.isValid) {
      console.warn('要約の検証エラー:', summaryValidation.errors);
      summary = cleanupSummary(summary);
    }
    
    if (!detailedSummary) {
      // フォールバック: より意味のある内容を生成
      const bulletPoints = [];
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