import { detectArticleType } from '../utils/article-type-detector';
import { generatePromptForArticleType } from '../utils/article-type-prompts';
import { normalizeTag } from '../utils/tag-normalizer';

export interface ClaudeSummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
}

export class ClaudeHandler {
  constructor() {
    // Claude Codeでの処理のため、APIキー等は不要
  }

  /**
   * Claude Codeを使用して要約とタグを生成
   * @param title 記事のタイトル
   * @param content 記事の内容
   * @returns 要約、詳細要約、タグ、記事タイプ
   */
  async generateSummaryAndTags(
    title: string,
    content: string
  ): Promise<ClaudeSummaryAndTags> {
    // 記事タイプを判定
    const articleType = detectArticleType(title, content);
    
    // 記事タイプに応じたプロンプトを生成
    const _prompt = generatePromptForArticleType(articleType, title, content);
    
    // Claude Codeでの処理のため、ここでプロンプトを返す
    // 実際の要約生成はClaude Code自身が行う
    
    // Claude Codeが生成した結果を受け取る想定のインターフェース
    // 実際の処理はgenerate-summaries-claude.tsで行う
    return {
      summary: '',
      detailedSummary: '',
      tags: [],
      articleType
    };
  }

  /**
   * Claude Codeの応答から要約とタグを抽出
   * @param responseText Claude Codeの応答テキスト
   * @param articleType 記事タイプ
   * @returns 抽出された要約とタグ
   */
  parseSummaryAndTags(
    responseText: string,
    articleType: string
  ): ClaudeSummaryAndTags {
    const lines = responseText.split('\n');
    let summary = '';
    let detailedSummary = '';
    let tags: string[] = [];
    let isDetailedSummary = false;
    
    // パターン定義（既存のGemini実装と同じ）
    const summaryPatterns = [
      /^(\*\*)?要約[:：]\s*(\*\*)?/,
      /^【要約】[:：]?\s*/,
      /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
      /^【短い要約】[:：]?\s*/
    ];
    
    const detailedSummaryPatterns = [
      /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
      /^【詳細要約】[:：]?\s*/
    ];

    let summaryStarted = false;
    let detailedSummaryStarted = false;

    for (const line of lines) {
      // summary処理
      if (!summaryStarted && summaryPatterns.some(pattern => pattern.test(line))) {
        summary = line;
        summaryPatterns.forEach(pattern => {
          summary = summary.replace(pattern, '');
        });
        summary = this.cleanupText(summary);
        summaryStarted = true;
        isDetailedSummary = false;
      }
      // summaryの続きの行
      else if (summaryStarted && !detailedSummaryStarted && line.trim() && 
               !detailedSummaryPatterns.some(pattern => pattern.test(line)) && 
               !line.match(/^タグ[:：]/)) {
        summary += '\n' + this.cleanupText(line);
      }
      // detailedSummary処理
      else if (detailedSummaryPatterns.some(pattern => pattern.test(line))) {
        detailedSummary = line;
        detailedSummaryPatterns.forEach(pattern => {
          detailedSummary = detailedSummary.replace(pattern, '');
        });
        detailedSummary = this.cleanupText(detailedSummary);
        detailedSummaryStarted = true;
        isDetailedSummary = true;
      }
      // detailedSummaryの続きの行
      else if (isDetailedSummary && line.trim() && !line.match(/^タグ[:：]/)) {
        if (line.trim().startsWith('・')) {
          detailedSummary += '\n' + line.trim();
        } else {
          detailedSummary += '\n' + this.cleanupText(line);
        }
      }
      // タグ処理
      else if (line.match(/^タグ[:：]/)) {
        isDetailedSummary = false;
        const tagLine = line.replace(/^タグ[:：]\s*/, '');
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30)
          .map(tag => normalizeTag(tag));
      }
      // 空行でセクション終了
      else if (!line.trim()) {
        if (summaryStarted && !detailedSummaryStarted) {
          summaryStarted = false;
        }
      }
    }
    
    // 最終クリーンアップ
    summary = this.finalCleanup(summary);
    detailedSummary = this.finalCleanup(detailedSummary);
    
    // フォールバック
    if (!summary) {
      summary = responseText.substring(0, 150);
    }
    if (!detailedSummary) {
      detailedSummary = responseText.substring(0, 300);
    }

    return { summary, detailedSummary, tags, articleType };
  }

  /**
   * テキストのクリーンアップ
   */
  private cleanupText(text: string): string {
    return text
      .replace(/\*\*/g, '') // マークダウン除去
      .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
      .trim();
  }

  /**
   * 最終的なクリーンアップ
   */
  private finalCleanup(text: string): string {
    if (!text) return text;
    
    // 冒頭の重複ラベル除去
    const cleanupPatterns = [
      /^(\*\*)?要約[:：]\s*(\*\*)?/,
      /^【要約】[:：]?\s*/,
      /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
      /^【短い要約】[:：]?\s*/,
      /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
      /^【詳細要約】[:：]?\s*/,
      /^【?\d+-\d+文字.*?】?\s*/,
      /^【?簡潔にまとめ.*?】?\s*/
    ];
    
    cleanupPatterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    // 先頭の句読点を除去
    text = text.replace(/^[、。]\s*/, '');
    
    // 改行の正規化
    text = text.replace(/\n+/g, '\n').trim();
    
    // 文末に句点がない場合は追加（箇条書きの場合は除く）
    if (text && !text.includes('・') && !text.match(/[。！？]$/)) {
      text += '。';
    }
    
    return text;
  }

  /**
   * プロンプトの表示（デバッグ用）
   */
  getPromptForArticle(title: string, content: string): string {
    const articleType = detectArticleType(title, content);
    return generatePromptForArticleType(articleType, title, content);
  }
}