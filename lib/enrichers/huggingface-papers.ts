/**
 * Hugging Face Papers Content Enricher
 * Hugging Face Daily Papers記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';

export class HuggingFacePapersEnricher extends BaseContentEnricher {
  /**
   * Hugging Face PapersのURLパターンにマッチするかチェック
   * URLをパースして適切にホスト名を検証（セキュリティ対策）
   */
  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // ホワイトリスト方式で許可されたドメインのみ受け入れる
      const allowedHosts = [
        'huggingface.co',
        'www.huggingface.co',
        'arxiv.org',
        'www.arxiv.org',
        'papers.ssrn.com',
        'www.papers.ssrn.com',
        'openreview.net',
        'www.openreview.net'
      ];

      // 完全一致でチェック（サブドメイン攻撃を防ぐ）
      return allowedHosts.includes(hostname) ||
             (hostname === 'huggingface.co' && parsed.pathname.includes('/papers'));
    } catch {
      // URLパースエラーの場合はfalse
      return false;
    }
  }

  /**
   * Hugging Face Papersまたは論文ページから本文を取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);

      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);

      // Hugging Face Papers特有のセレクタ
      const selectors = [
        // Hugging Face Papers特有のセレクタ
        '.paper-abstract',
        '.abstract-content',
        'section[class*="Abstract"]',
        'div[class*="abstract"]',

        // arXiv系のセレクタ
        'blockquote.abstract',
        '.abstract',
        '#abs blockquote',

        // 論文サイト共通のセレクタ
        '.paper-content',
        '.content-wrapper',
        'article.paper',
        '.publication-content',

        // より一般的なセレクタ
        'article',
        '.content',
        '.main-content',
        'main',
      ];

      const content = this.sanitizeContent(html, selectors);

      // 論文のメタデータを抽出して追加
      const metadata = this.extractPaperMetadata(html);
      const enrichedContent = metadata ? `${metadata}\n\n${content}` : content;

      // コンテンツが取得できたか確認（論文は通常500文字以上）
      if (!this.isContentSufficient(enrichedContent, 500)) {
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        const enrichedFallback = metadata ? `${metadata}\n\n${fallbackContent}` : fallbackContent;

        if (this.isContentSufficient(enrichedFallback, 500)) {
          return { content: enrichedFallback, thumbnail };
        }

        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          return { content: enrichedContent || null, thumbnail };
        }

        return null;
      }

      return { content: enrichedContent, thumbnail };

    } catch (_error) {
      return null;
    }
  }

  /**
   * 論文のメタデータを抽出
   */
  private extractPaperMetadata(html: string): string {
    const metadata: string[] = [];

    // タイトル抽出
    const titlePatterns = [
      /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i,
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /<title>([^<]+)<\/title>/i,
    ];

    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        // まずsanitizeHtmlでHTMLタグを安全に除去してから整形
        const sanitized = sanitizeHtml(match[1]);
        const title = sanitized
          .replace(/\s*\|.*$/, '') // サイト名を削除
          .replace(/\[.*?\]/g, '') // [PDF]等を削除
          .trim();
        if (title) {
          metadata.push(`Title: ${title}`);
          break;
        }
      }
    }

    // 著者抽出
    const authorPatterns = [
      /<div[^>]*class="[^"]*authors?[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<span[^>]*class="[^"]*authors?[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    ];

    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        // sanitizeHtmlを使用してHTMLタグを安全に除去（XSS対策）
        const authors = sanitizeHtml(match[1])
          .replace(/\s+/g, ' ')
          .trim();
        if (authors) {
          metadata.push(`Authors: ${authors}`);
          break;
        }
      }
    }

    // 日付抽出
    const datePatterns = [
      /Published[:\s]+([^<\n]+)/i,
      /Date[:\s]+([^<\n]+)/i,
      /Submitted[:\s]+([^<\n]+)/i,
    ];

    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const date = match[1].trim();
        if (date) {
          metadata.push(`Published: ${date}`);
          break;
        }
      }
    }

    // arXiv ID抽出
    const arxivMatch = html.match(/arXiv[:\s]+(\d+\.\d+)/);
    if (arxivMatch) {
      metadata.push(`arXiv ID: ${arxivMatch[1]}`);
    }

    return metadata.join('\n');
  }

  /**
   * より広範囲から本文を抽出（フォールバック）
   */
  private extractWithFallback(html: string): string {
    const selectors = [
      // 論文本文を含む可能性が高い要素
      '.paper-wrapper',
      '#paper-content',
      '.publication',
      'article',
      'main',
      '[role="main"]',
      '.container',
    ];

    return this.sanitizeContent(html, selectors);
  }
}