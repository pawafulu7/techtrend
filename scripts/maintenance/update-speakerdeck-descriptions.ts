import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { speakerDeckConfig } from '@/lib/config/speakerdeck';

const prisma = new PrismaClient();

interface UpdateResult {
  success: number;
  failed: number;
  skipped: number;
  errors: { articleId: number; error: string }[];
}

/**
 * プレゼンテーションの詳細情報を取得
 */
async function fetchPresentationDetails(url: string): Promise<{
  description: string | null;
  publishedAt: Date | null;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), speakerDeckConfig.timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    let description: string | null = null;
    let publishedAt: Date | null = null;
    
    // JSON-LDから情報を取得（推奨）
    const jsonLdScript = $('script[type="application/ld+json"]').html();
    if (jsonLdScript) {
      try {
        const data = JSON.parse(jsonLdScript);
        description = data.description || null;
        publishedAt = data.datePublished ? new Date(data.datePublished) : null;
        
        console.log('  JSON-LDから取得成功');
      } catch (error) {
        console.log('  JSON-LD解析エラー、HTMLから取得を試みます');
      }
    }
    
    // フォールバック: HTMLから直接取得
    if (!description) {
      description = $('.deck-description').text().trim() || 
                   $('meta[name="description"]').attr('content') || 
                   null;
      
      if (description) {
        console.log('  HTMLから取得成功');
      }
    }
    
    if (!publishedAt) {
      const dateText = $('.deck-date').text();
      const dateMatch = dateText.match(/(\w+)\s+(\d{2}),\s+(\d{4})/);
      
      if (dateMatch) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIndex = monthNames.indexOf(dateMatch[1]);
        if (monthIndex !== -1) {
          publishedAt = new Date(`${dateMatch[3]}-${(monthIndex + 1).toString().padStart(2, '0')}-${dateMatch[2]}`);
        }
      }
    }
    
    return { description, publishedAt };
  } catch (error) {
    console.error(`  エラー: ${error}`);
    throw error;
  }
}

/**
 * 遅延処理
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Speaker Deck記事のdescriptionを更新
 */
async function updateSpeakerDeckDescriptions(testMode = false): Promise<UpdateResult> {
  const result: UpdateResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  try {
    // Speaker Deckソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });
    
    if (!source) {
      console.log('Speaker Deckソースが見つかりません');
      return result;
    }
    
    // contentがタイトルと同じかnullの記事を取得
    const allArticles = await prisma.article.findMany({
      where: { 
        sourceId: source.id
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    // contentがタイトルと同じか、短すぎる記事をフィルタリング
    const articles = allArticles.filter(article => {
      return !article.content || 
             article.content.length < 100 || 
             article.content === article.title;
    }).slice(0, testMode ? 1 : undefined);
    
    console.log(`\n=== Speaker Deck Description更新 ===`);
    console.log(`対象記事数: ${articles.length}件`);
    console.log(`モード: ${testMode ? 'テスト（1件のみ）' : '本番（全件）'}`);
    console.log('');
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.log(`\n[${i + 1}/${articles.length}] ${article.title.substring(0, 50)}...`);
      console.log(`  URL: ${article.url}`);
      
      // 既存のcontentをチェック
      if (article.content && article.content.length > 100 && article.content !== article.title) {
        console.log(`  スキップ: 既に十分なcontentが存在 (${article.content.length}文字)`);
        result.skipped++;
        continue;
      }
      
      try {
        // 詳細情報を取得
        console.log('  取得中...');
        const details = await fetchPresentationDetails(article.url);
        
        if (!details.description) {
          console.log('  警告: descriptionが取得できませんでした');
          result.failed++;
          result.errors.push({
            articleId: article.id,
            error: 'description not found'
          });
          continue;
        }
        
        // データベースを更新
        const updateData: any = {
          content: details.description // contentを更新
        };
        
        // publishedAtが取得できて、現在の値と異なる場合は更新
        if (details.publishedAt && 
            Math.abs(details.publishedAt.getTime() - article.publishedAt.getTime()) > 86400000) {
          updateData.publishedAt = details.publishedAt;
          console.log(`  公開日も更新: ${details.publishedAt.toISOString().split('T')[0]}`);
        }
        
        await prisma.article.update({
          where: { id: article.id },
          data: updateData
        });
        
        console.log(`  ✅ 更新成功: ${details.description.substring(0, 100)}...`);
        result.success++;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ エラー: ${errorMessage}`);
        result.failed++;
        result.errors.push({
          articleId: article.id,
          error: errorMessage
        });
      }
      
      // レート制限対策
      if (i < articles.length - 1) {
        await delay(speakerDeckConfig.requestDelay);
      }
    }
    
    // 統計を表示
    console.log('\n=== 更新結果 ===');
    console.log(`成功: ${result.success}件`);
    console.log(`失敗: ${result.failed}件`);
    console.log(`スキップ: ${result.skipped}件`);
    
    if (result.errors.length > 0) {
      console.log('\n=== エラー詳細 ===');
      result.errors.forEach(err => {
        console.log(`記事ID ${err.articleId}: ${err.error}`);
      });
    }
    
    // 更新後の統計
    const totalArticles = await prisma.article.count({
      where: { sourceId: source.id }
    });
    
    const articlesWithContent = await prisma.article.count({
      where: { 
        sourceId: source.id,
        NOT: [
          { content: null },
          { content: '' }
        ]
      }
    });
    
    const articlesWithGoodContent = allArticles.filter(article => {
      return article.content && 
             article.content.length > 100 && 
             article.content !== article.title;
    }).length;
    
    console.log('\n=== 全体統計 ===');
    console.log(`総記事数: ${totalArticles}`);
    console.log(`content有り: ${articlesWithContent} (${(articlesWithContent/totalArticles*100).toFixed(1)}%)`);
    console.log(`十分なcontent有り: ${articlesWithGoodContent} (${(articlesWithGoodContent/totalArticles*100).toFixed(1)}%)`);
    console.log(`content不足: ${totalArticles - articlesWithGoodContent} (${((totalArticles - articlesWithGoodContent)/totalArticles*100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('処理エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
  
  return result;
}

// 直接実行された場合
if (require.main === module) {
  const testMode = process.argv.includes('--test');
  
  updateSpeakerDeckDescriptions(testMode)
    .then((result) => {
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { updateSpeakerDeckDescriptions };