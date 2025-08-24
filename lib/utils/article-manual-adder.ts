/**
 * 手動記事追加のコアロジック
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../ai/unified-summary-service';
import { ContentEnricherFactory } from '../enrichers';
import { detectSourceFromUrl, normalizeSourceName, isValidUrl } from './source-detector';
import { WebFetcher } from '../utils/web-fetcher';
import * as cheerio from 'cheerio';

// グローバルなPrismaインスタンス（テストで上書き可能）
let prisma = new PrismaClient();

// テスト用にPrismaインスタンスを設定できる関数
export function setPrismaClient(client: PrismaClient) {
  prisma = client;
}

export interface AddArticleOptions {
  url: string;
  title?: string;
  skipSummary?: boolean;
  dryRun?: boolean;
  skipEnrichment?: boolean;
}

export interface AddArticleResult {
  success: boolean;
  articleId?: string;
  title?: string;
  source?: string;
  summary?: string;
  detailedSummary?: string;
  message?: string;
  error?: string;
}

/**
 * テキストから技術タグを抽出（最小限のタグのみ）
 */
function extractTags(text: string, sourceName: string): string[] {
  const tags: string[] = [];
  
  // ソースに基づく基本タグ（presentationは意味があるので残す）
  if (sourceName === 'Speaker Deck') {
    tags.push('presentation');
  }
  
  // タグ抽出は最小限にする（Geminiが後で適切なタグを生成するため）
  // 明確にタイトルに含まれる主要技術のみを抽出
  
  return tags;
}

/**
 * URLから基本的なメタデータを取得
 */
async function fetchBasicMetadata(url: string) {
  try {
    const fetcher = new WebFetcher();
    const html = await fetcher.fetch(url);
    const $ = cheerio.load(html);
    
    // タイトルの取得（優先順位: og:title > title > h1）
    let title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('title').text().trim() ||
                $('h1').first().text().trim();
    
    // タイトルが取得できなかった場合、URLから生成
    if (!title || title === '') {
      const pathParts = new URL(url).pathname.split('/').filter(p => p);
      const lastPart = pathParts[pathParts.length - 1] || '';
      // URLのパスを人間が読みやすい形式に変換
      title = lastPart
        .replace(/[-_]/g, ' ')
        .replace(/\.\w+$/, '') // 拡張子を削除
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      if (!title) {
        title = 'Untitled Article';
      }
    }
    
    // OGP画像の取得
    const thumbnail = $('meta[property="og:image"]').attr('content') ||
                     $('meta[name="twitter:image"]').attr('content') ||
                     null;
    
    // 説明の取得
    const description = $('meta[property="og:description"]').attr('content') ||
                       $('meta[name="description"]').attr('content') ||
                       $('meta[name="twitter:description"]').attr('content') ||
                       '';
    
    // キーワードの取得（タグとして使用）
    const keywordsContent = $('meta[name="keywords"]').attr('content') || '';
    const keywords = keywordsContent ? keywordsContent.split(',').map(k => k.trim()).filter(k => k) : [];
    
    return { title, thumbnail, description, content: description, keywords };
  } catch (error) {
    console.error('基本メタデータ取得エラー:', error);
    return { title: 'Untitled Article', thumbnail: null, description: '', content: '', keywords: [] };
  }
}

/**
 * 手動で記事を追加する
 */
export async function addArticleManually(options: AddArticleOptions): Promise<AddArticleResult> {
  const { url, title: customTitle, skipSummary = false, dryRun = false, skipEnrichment = false } = options;
  
  // URL検証
  if (!isValidUrl(url)) {
    return {
      success: false,
      error: '無効なURLです。http://またはhttps://で始まるURLを指定してください。'
    };
  }
  
  try {
    // 重複チェック
    const existingArticle = await prisma.article.findFirst({
      where: { url }
    });
    
    if (existingArticle) {
      return {
        success: false,
        error: '既に同じURLの記事が存在します。',
        articleId: existingArticle.id,
        title: existingArticle.title
      };
    }
    
    // ソース判定
    const detectionResult = detectSourceFromUrl(url);
    const sourceName = normalizeSourceName(detectionResult.source);
    
    console.error(`📍 ソース判定: ${sourceName} (信頼度: ${detectionResult.confidence})`);
    
    // ソースの取得または作成
    let source = await prisma.source.findFirst({
      where: { name: sourceName }
    });
    
    if (!source) {
      if (dryRun) {
        // ドライランの場合は仮のソースオブジェクトを作成
        source = { id: 'dry-run-source', name: sourceName } as Source;
      } else {
        source = await prisma.source.create({
          data: {
            name: sourceName,
            type: 'manual',
            url: new URL(url).origin,
            enabled: true
          }
        });
        console.error(`✅ 新規ソース作成: ${sourceName}`);
      }
    }
    
    // エンリッチメント処理
    let enrichedData = null;
    let content = '';
    let thumbnail = null;
    let finalTitle = customTitle || '';
    let tagNames: string[] = [];
    
    if (!skipEnrichment) {
      const enricherFactory = new ContentEnricherFactory();
      const enricher = enricherFactory.getEnricher(url);
      
      if (enricher) {
        console.error(`🔍 エンリッチャー使用: ${enricher.constructor.name}`);
        try {
          enrichedData = await enricher.enrich(url);
          if (enrichedData) {
            content = enrichedData.content || '';
            thumbnail = enrichedData.thumbnail || null;
            if (!customTitle && enrichedData.title) {
              finalTitle = enrichedData.title;
            }
            // エンリッチャーからタグを取得
            if (enrichedData.tags && Array.isArray(enrichedData.tags)) {
              tagNames = enrichedData.tags;
            }
            console.error(`✅ エンリッチメント成功: ${content.length}文字`);
          }
        } catch (enrichError) {
          console.warn(`⚠️ エンリッチメント失敗:`, enrichError);
        }
      }
    }
    
    // エンリッチャーがタイトルを返さなかった場合、またはエンリッチャーが使えない場合は基本メタデータを取得
    let metadata: {title?: string; description?: string; image?: string} | null = null;
    if (!finalTitle && !customTitle) {
      console.error('📥 基本メタデータ取得中...');
      metadata = await fetchBasicMetadata(url);
      finalTitle = metadata.title;
      // コンテンツが取得できていない場合のみ、メタデータのコンテンツを使用
      if (!content) {
        content = metadata.content;
      }
      // サムネイルが取得できていない場合のみ、メタデータのサムネイルを使用
      if (!thumbnail) {
        thumbnail = metadata.thumbnail;
      }
      // メタデータからキーワードをタグとして使用（ただし既にタグがある場合はスキップ）
      if (tagNames.length === 0 && metadata.keywords && metadata.keywords.length > 0) {
        tagNames = metadata.keywords;
      }
    }
    
    // カスタムタイトルが指定されている場合は優先
    if (customTitle) {
      finalTitle = customTitle;
    }
    
    // タイトルが空の場合はURLから生成
    if (!finalTitle) {
      finalTitle = 'Untitled Article';
    }
    
    // タグが未設定の場合、タイトルとコンテンツから自動抽出
    if (tagNames.length === 0) {
      const textForTagExtraction = `${finalTitle} ${content}`;
      tagNames = extractTags(textForTagExtraction, sourceName);
    }
    
    if (dryRun) {
      console.error('🔄 ドライラン: 実際の保存は行いません');
      console.error(`  タイトル: ${finalTitle}`);
      console.error(`  タグ: ${tagNames.join(', ') || 'なし'}`);
      return {
        success: true,
        title: finalTitle,
        source: sourceName,
        message: 'ドライラン完了（実際の保存なし）'
      };
    }
    
    // タグの処理（既存のcollect-feeds.tsと同じパターン）
    const tagConnections = [];
    if (tagNames && tagNames.length > 0) {
      for (const tagName of tagNames) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName }
        });
        tagConnections.push({ id: tag.id });
      }
      console.error(`🏷️ タグ: ${tagNames.join(', ')}`);
    }
    
    // 記事の保存
    const article = await prisma.article.create({
      data: {
        title: finalTitle,
        url,
        summary: null,
        detailedSummary: null,
        thumbnail,
        content: content || null,
        publishedAt: new Date(),
        sourceId: source!.id,
        bookmarks: 0,
        qualityScore: 0,
        summaryVersion: 0,
        articleType: 'manual',
        ...(tagConnections.length > 0 && {
          tags: {
            connect: tagConnections
          }
        })
      }
    });
    
    console.error(`✅ 記事保存完了: ${article.id}`);
    
    // 要約生成
    let summary = null;
    let detailedSummary = null;
    let generatedTags: string[] = [];
    
    if (!skipSummary && content && content.length > 100) {
      console.error('📝 要約生成中...');
      try {
        const summaryService = new UnifiedSummaryService();
        const result = await summaryService.generate(finalTitle, content);
        
        // resultが正常に返ってきた場合
        summary = result.summary;
        detailedSummary = result.detailedSummary;
        generatedTags = result.tags || [];
        
        // 要約を更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary,
            detailedSummary,
            summaryVersion: result.summaryVersion || 7,
            articleType: result.articleType || 'unified'
          }
        });
        
        // Geminiが生成したタグを記事に追加
        if (generatedTags.length > 0) {
          const tagConnections = [];
          for (const tagName of generatedTags) {
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName }
            });
            tagConnections.push({ id: tag.id });
          }
          
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                connect: tagConnections
              }
            }
          });
          console.error(`🏷️ 要約生成時のタグ: ${generatedTags.join(', ')}`);
        }
        
        console.error('✅ 要約生成完了');
      } catch (summaryError) {
        console.error('❌ 要約生成エラー:', summaryError);
      }
    } else if (skipSummary) {
      console.error('⏭️ 要約生成をスキップ');
    } else {
      console.error('⚠️ コンテンツが短いため要約生成をスキップ');
    }
    
    return {
      success: true,
      articleId: article.id,
      title: finalTitle,
      source: sourceName,
      summary,
      detailedSummary,
      message: '記事を正常に追加しました'
    };
    
  } catch (error) {
    console.error('❌ 記事追加エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 複数のURLを一括で追加
 */
export async function addArticlesBatch(urls: string[], options: Omit<AddArticleOptions, 'url'> = {}) {
  const results: AddArticleResult[] = [];
  
  for (const url of urls) {
    console.error(`\n🔄 処理中: ${url}`);
    const result = await addArticleManually({ ...options, url });
    results.push(result);
    
    // Rate limit対策
    if (result.success && !options.skipSummary) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // サマリー表示
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.error(`\n📊 バッチ処理完了: 成功 ${successful}件、失敗 ${failed}件`);
  
  return results;
}