/**
 * arXiv AI Content Enricher
 * arXiv AI関連論文のアブストラクトとフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';

export class ArxivAIEnricher extends BaseContentEnricher {
  /**
   * arXivのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'arxiv.org');
  }

  /**
   * arXivの論文ページからアブストラクトとメタデータを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);

      // サムネイルを取得（arXivは基本的にサムネイルがない）
      const thumbnail = this.extractThumbnail(html);

      // arXivの論文構造に合わせたセレクタ
      const selectors = [
        // arXiv特有のセレクタ
        '.abstract',  // アブストラクトセクション
        'blockquote.abstract',
        '#abs .abstract-content',
        '.leftcolumn blockquote',

        // 論文の詳細情報
        '.tablecell',
        '.arxivid',
        '.submission-history',

        // より一般的なセレクタ
        'article',
        '.content',
        'main',
      ];

      // アブストラクトを優先的に取得
      let content = this.extractAbstract(html);

      // アブストラクトが取得できない場合は通常のセレクタで取得
      if (!content || content.length < 200) {
        content = this.sanitizeContent(html, selectors);
      }

      // メタデータを追加
      const metadata = this.extractMetadata(html);
      if (metadata) {
        content = metadata + '\n\n' + content;
      }

      // コンテンツが取得できたか確認（arXivアブストラクトは通常200文字以上）
      if (!this.isContentSufficient(content, 200)) {
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 200)) {
          const combined = metadata ? `${metadata}\n\n${fallbackContent}` : fallbackContent;
          return { content: combined, thumbnail };
        }

        return null;
      }

      return { content, thumbnail };

    } catch (_error) {
      return null;
    }
  }

  /**
   * アブストラクトを優先的に抽出
   */
  private extractAbstract(html: string): string {
    const abstractSelectors = [
      'blockquote.abstract',
      '.abstract',
      'blockquote:contains("Abstract")',
      'div.abstract-content',
      '#abs blockquote',
    ];

    for (const selector of abstractSelectors) {
      const content = this.sanitizeContent(html, [selector]);
      if (content && content.length > 100) {
        return content;
      }
    }

    return '';
  }

  /**
   * 論文のメタデータを抽出
   */
  private extractMetadata(html: string): string {
    const metadata: string[] = [];

    // タイトル（descriptor "Title:" を除去）
    const rawTitle = this.sanitizeContent(html, ['h1.title']);
    const title = rawTitle.replace(/^Title:\s*/i, '').trim();
    if (title) {
      metadata.push(`Title: ${title}`);
    }

    // 著者（descriptor "Authors:" を除去）
    const authorsMatch = html.match(/<div[^>]*class=["']authors["'][^>]*>([\s\S]*?)<\/div>/i);
    if (authorsMatch) {
      const authors = authorsMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^Authors:\s*/i, '')
        .trim();
      if (authors) {
        metadata.push(`Authors: ${authors}`);
      }
    }

    // arXiv ID（meta優先、次に本文）
    let arxivId: string | null = null;
    const idMeta = html.match(/<meta[^>]+name=["']citation_arxiv_id["'][^>]+content=["']([^"']+)["']/i);
    if (idMeta) {
      arxivId = idMeta[1];
    } else {
      const idText = html.match(/\barXiv:(\d{4}\.\d{4,5})(?:v\d+)?\b/i);
      if (idText) {
        arxivId = idText[1];
      }
    }
    if (arxivId) {
      metadata.push(`arXiv ID: ${arxivId}`);
    }

    // カテゴリ（(cs.AI) または [cs.AI]）
    const categoryMatch =
      html.match(/\(([a-z\-]+\.[A-Z]+)\)/) || html.match(/\[([a-z\-]+\.[A-Z]+)\]/);
    if (categoryMatch) {
      metadata.push(`Category: ${categoryMatch[1]}`);
    }

    return metadata.join('\n');
  }

  /**
   * より広範囲から本文を抽出（フォールバック）
   */
  private extractWithFallback(html: string): string {
    const selectors = [
      // 論文本文を含む可能性が高い要素
      '#abs',
      '.leftcolumn',
      '.arxiv-content',
      'article',
      'main',
      '[role="main"]',
    ];

    return this.sanitizeContent(html, selectors);
  }
}