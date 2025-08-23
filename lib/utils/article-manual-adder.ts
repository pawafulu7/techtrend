/**
 * 手動記事追加のコアロジック
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../ai/unified-summary-service';
import { ContentEnricherFactory } from '../enrichers';
import { detectSourceFromUrl, normalizeSourceName, isValidUrl } from './source-detector';
import { WebFetcher } from '../utils/web-fetcher';

const prisma = new PrismaClient();

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
 * URLから基本的なメタデータを取得
 */
async function fetchBasicMetadata(url: string) {
  try {
    const fetcher = new WebFetcher();
    const html = await fetcher.fetch(url);
    
    // タイトルの取得
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
    
    // OGP画像の取得
    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    const thumbnail = ogImageMatch ? ogImageMatch[1] : null;
    
    // 説明の取得
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    const description = descMatch ? descMatch[1] : '';
    
    return { title, thumbnail, description, content: description };
  } catch (error) {
    console.error('基本メタデータ取得エラー:', error);
    return { title: url, thumbnail: null, description: '', content: '' };
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
    
    console.log(`📍 ソース判定: ${sourceName} (信頼度: ${detectionResult.confidence})`);
    
    // ソースの取得または作成
    let source = await prisma.source.findFirst({
      where: { name: sourceName }
    });
    
    if (!source && !dryRun) {
      source = await prisma.source.create({
        data: {
          name: sourceName,
          type: 'manual',
          url: new URL(url).origin,
          enabled: true
        }
      });
      console.log(`✅ 新規ソース作成: ${sourceName}`);
    }
    
    // エンリッチメント処理
    let enrichedData = null;
    let content = '';
    let thumbnail = null;
    let finalTitle = customTitle || '';
    
    if (!skipEnrichment) {
      const enricherFactory = new ContentEnricherFactory();
      const enricher = enricherFactory.getEnricher(url);
      
      if (enricher) {
        console.log(`🔍 エンリッチャー使用: ${enricher.constructor.name}`);
        try {
          enrichedData = await enricher.enrich(url);
          if (enrichedData) {
            content = enrichedData.content || '';
            thumbnail = enrichedData.thumbnail || null;
            if (!customTitle && enrichedData.title) {
              finalTitle = enrichedData.title;
            }
            console.log(`✅ エンリッチメント成功: ${content.length}文字`);
          }
        } catch (enrichError) {
          console.warn(`⚠️ エンリッチメント失敗:`, enrichError);
        }
      }
    }
    
    // エンリッチャーが使えない場合は基本メタデータを取得
    if (!enrichedData && !customTitle) {
      console.log('📥 基本メタデータ取得中...');
      const metadata = await fetchBasicMetadata(url);
      finalTitle = customTitle || metadata.title;
      content = metadata.content;
      thumbnail = metadata.thumbnail;
    }
    
    // タイトルが空の場合はURLを使用
    if (!finalTitle) {
      finalTitle = url;
    }
    
    if (dryRun) {
      console.log('🔄 ドライラン: 実際の保存は行いません');
      return {
        success: true,
        title: finalTitle,
        source: sourceName,
        message: 'ドライラン完了（実際の保存なし）'
      };
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
        articleType: 'manual'
      }
    });
    
    console.log(`✅ 記事保存完了: ${article.id}`);
    
    // 要約生成
    let summary = null;
    let detailedSummary = null;
    
    if (!skipSummary && content && content.length > 100) {
      console.log('📝 要約生成中...');
      try {
        const summaryService = new UnifiedSummaryService();
        const result = await summaryService.generate(finalTitle, content);
        
        if (result.success) {
          summary = result.summary;
          detailedSummary = result.detailedSummary;
          
          // 要約を更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary,
              detailedSummary,
              summaryVersion: 7,
              articleType: 'unified'
            }
          });
          
          console.log('✅ 要約生成完了');
        } else {
          console.warn('⚠️ 要約生成失敗:', result.error);
        }
      } catch (summaryError) {
        console.error('❌ 要約生成エラー:', summaryError);
      }
    } else if (skipSummary) {
      console.log('⏭️ 要約生成をスキップ');
    } else {
      console.log('⚠️ コンテンツが短いため要約生成をスキップ');
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
    console.log(`\n🔄 処理中: ${url}`);
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
  
  console.log(`\n📊 バッチ処理完了: 成功 ${successful}件、失敗 ${failed}件`);
  
  return results;
}