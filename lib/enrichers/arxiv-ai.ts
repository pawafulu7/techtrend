/**
 * arXiv AI Content Enricher
 * arXiv AI関連論文のアブストラクトとフルコンテンツ取得
 *
 * 2024年以降の論文はHTML (experimental)版から本文を取得し、
 * より詳細な要約生成を可能にする。
 * HTML版がない場合は従来の抄録ベース処理にフォールバック。
 */

import * as cheerio from 'cheerio';
import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';
import { logger } from '@/lib/logger';

export class ArxivAIEnricher extends BaseContentEnricher {
  /**
   * arXivのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'arxiv.org');
  }

  /**
   * arXivの論文ページからコンテンツを取得
   *
   * 処理フロー:
   * 1. URLからarXiv IDを抽出
   * 2. HTML版（/html/{id}v1）の取得を試行
   * 3. 成功: 本文セクション（Introduction, Method, Conclusion等）を抽出
   * 4. 失敗: 従来の抄録ベース処理にフォールバック
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      // Step 1: arXiv IDを抽出
      const arxivId = this.extractArxivIdFromUrl(url);

      // Step 2: HTML版の取得を試行（arXiv IDが取得できた場合のみ）
      if (arxivId) {
        const htmlContent = await this.fetchAndExtractHtmlVersion(arxivId);
        if (htmlContent) {
          // HTML版から取得成功 - メタデータを追加して返却
          // 抄録ページからメタデータのみ取得
          try {
            const absHtml = await this.fetchWithRetry(url);
            const metadata = this.extractMetadata(absHtml);
            const thumbnail = this.extractThumbnail(absHtml);
            const content = metadata ? `${metadata}\n\n${htmlContent}` : htmlContent;
            return { content, thumbnail };
          } catch {
            // メタデータ取得失敗時はHTML本文のみ返却
            return { content: htmlContent, thumbnail: undefined };
          }
        }
      }

      // Step 3: フォールバック - 従来の抄録ベース処理
      logger.debug({ url, arxivId }, 'Using fallback abstract-based extraction');
      return this.enrichFromAbstract(url);
    } catch (error) {
      logger.error(
        { url, error: error instanceof Error ? error.message : String(error) },
        'Failed to enrich arXiv article'
      );
      return null;
    }
  }

  /**
   * 従来の抄録ベース処理（フォールバック用）
   */
  private async enrichFromAbstract(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);

      // サムネイルを取得（arXivは基本的にサムネイルがない）
      const thumbnail = this.extractThumbnail(html);

      // arXivの論文構造に合わせたセレクタ
      const selectors = [
        // arXiv特有のセレクタ
        '.abstract', // アブストラクトセクション
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

  // ============================================================
  // HTML (experimental) 版からの本文取得機能
  // ============================================================

  /**
   * URLからarXiv IDを抽出
   * 対応パターン:
   * - /abs/2412.01234, /pdf/2412.01234, /html/2412.01234
   * - バージョンサフィックス (v1, v2等)
   * - arXiv:2412.01234 形式
   * - クエリパラメータ付きURL
   */
  private extractArxivIdFromUrl(url: string): string | null {
    // ドメインチェック
    if (!isUrlFromDomain(url, 'arxiv.org')) {
      return null;
    }

    // パターンマッチング
    const patterns = [
      // /abs/2412.01234, /pdf/2412.01234, /html/2412.01234 形式
      /\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/i,
      // arXiv:2412.01234 形式
      /arXiv:(\d{4}\.\d{4,5})(?:v\d+)?/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * HTML版論文ページを取得し、本文を抽出
   * @returns 抽出したコンテンツ、取得失敗時はnull
   */
  private async fetchAndExtractHtmlVersion(arxivId: string): Promise<string | null> {
    // HTML版URL構築（v1を指定）
    const htmlUrl = `https://arxiv.org/html/${arxivId}v1`;

    try {
      logger.debug({ arxivId, htmlUrl }, 'Fetching arXiv HTML version');
      const html = await this.fetchWithRetry(htmlUrl);

      // HTML版が利用不可の場合のチェック（ページ内メッセージ）
      if (html.includes('HTML is not available') || html.includes('No HTML version')) {
        logger.debug({ arxivId }, 'arXiv HTML version not available (page message)');
        return null;
      }

      // 本文セクションを抽出
      const content = this.extractFullContent(html);

      // コンテンツが十分か確認（最低500文字）
      if (!content || content.length < 500) {
        logger.debug(
          { arxivId, contentLength: content?.length || 0 },
          'arXiv HTML content insufficient, falling back to abstract'
        );
        return null;
      }

      logger.info(
        { arxivId, contentLength: content.length },
        'Successfully extracted arXiv HTML content'
      );
      return content;
    } catch (error) {
      // 404や他のエラーはフォールバックのトリガー
      logger.debug(
        { arxivId, error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch arXiv HTML version, will fallback to abstract'
      );
      return null;
    }
  }

  /**
   * HTML版論文から本文セクションを抽出
   * 対象: Abstract, Introduction, Method/Methodology, Results/Experiments, Conclusion/Discussion
   *
   * LLM要約のコンテキスト制限を考慮し、最大約8000トークン（約32000文字）に制限
   */
  private extractFullContent(html: string): string {
    const $ = cheerio.load(html);

    // 不要な要素を削除
    $('script, style, noscript, iframe, nav, footer, header').remove();
    $('.sidebar, .advertisement, .related-posts, .comments').remove();

    // 抽出対象セクション（優先度順）
    const targetSections = [
      'abstract',
      'introduction',
      'method',
      'methodology',
      'approach',
      'results',
      'experiments',
      'evaluation',
      'conclusion',
      'discussion',
      'summary',
    ];

    const contents: string[] = [];
    const maxTotalLength = 32000; // 約8000トークン相当
    let currentLength = 0;

    // sectionタグベースの抽出
    $('section').each((_, section) => {
      if (currentLength >= maxTotalLength) return;

      const $section = $(section);
      const heading = $section.find('h1, h2, h3, h4, h5, h6').first().text().toLowerCase();

      // 対象セクションかチェック
      const isTargetSection = targetSections.some((s) => heading.includes(s));
      if (!isTargetSection) return;

      // 数式をプレースホルダーに置換
      $section.find('math, .math, [class*="math"], .MathJax, .mathjax').replaceWith('[MATH]');

      // 図表のキャプションは保持、本体は除去
      $section.find('figure img, figure svg').remove();

      // テキスト抽出
      let sectionText = $section.text().trim();

      // 連続する[MATH]を整理
      sectionText = sectionText.replace(/(\[MATH\]\s*)+/g, '[MATH] ');

      // 空白の正規化
      sectionText = sectionText.replace(/\s+/g, ' ').trim();

      if (sectionText.length > 100) {
        // セクション見出しを追加
        const sectionTitle = heading.charAt(0).toUpperCase() + heading.slice(1);
        const formattedSection = `## ${sectionTitle}\n${sectionText}`;

        // 長さ制限チェック
        if (currentLength + formattedSection.length <= maxTotalLength) {
          contents.push(formattedSection);
          currentLength += formattedSection.length;
        }
      }
    });

    // フォールバック: sectionタグがない場合はmain/articleから取得
    if (contents.length === 0) {
      const mainContent = $('main, article, .content, .paper-content').first();
      if (mainContent.length > 0) {
        // 数式をプレースホルダーに置換
        mainContent.find('math, .math, [class*="math"], .MathJax, .mathjax').replaceWith('[MATH]');

        let text = mainContent.text().trim();
        text = text.replace(/(\[MATH\]\s*)+/g, '[MATH] ');
        text = text.replace(/\s+/g, ' ').trim();

        // 長さ制限
        if (text.length > maxTotalLength) {
          text = text.substring(0, maxTotalLength) + '...';
        }

        if (text.length > 500) {
          contents.push(text);
        }
      }
    }

    return contents.join('\n\n');
  }
}