#!/usr/bin/env tsx
import { CorporateTechBlogFetcher } from '../lib/fetchers/corporate-tech-blog';
import { PrismaClient } from '@prisma/client';
import { Source } from '@prisma/client';

async function fetchAndSaveCorporateBlog() {
  const prisma = new PrismaClient();
  
  console.log("=== Corporate Tech Blog 記事取得・保存 V2 ===");
  console.log(`環境変数 EXCLUDE_EVENT_ARTICLES: ${process.env.EXCLUDE_EVENT_ARTICLES || 'false'}`);
  console.log(`環境変数 MAX_ARTICLES_PER_COMPANY: ${process.env.MAX_ARTICLES_PER_COMPANY || '30'}`);
  console.log(`実行時刻: ${new Date().toISOString()}`);
  console.log("");
  
  try {
    // Corporate Tech Blogソースを取得または作成
    let source = await prisma.source.findFirst({
      where: { name: 'Corporate Tech Blog' }
    });
    
    if (!source) {
      console.log("Corporate Tech Blogソースを作成します...");
      source = await prisma.source.create({
        data: {
          name: 'Corporate Tech Blog',
          url: 'https://various-corporate-tech-blogs.com',
          type: 'RSS',
          isActive: true
        }
      });
    }
    
    // フェッチャーのインスタンスを作成
    const fetcher = new CorporateTechBlogFetcher();
    // sourceを設定
    (fetcher as any).source = source;
    
    console.log("記事を取得中...");
    const startTime = Date.now();
    
    // 記事を取得
    const result = await fetcher.fetch();
    
    const fetchTime = Date.now() - startTime;
    console.log(`\n取得完了: ${result.articles.length}件の記事を${(fetchTime / 1000).toFixed(2)}秒で取得`);
    
    if (result.errors.length > 0) {
      console.log(`エラー: ${result.errors.length}件`);
      result.errors.forEach(error => console.error(`  - ${error.message}`));
    }
    
    // 記事をデータベースに保存
    console.log("\n記事をデータベースに保存中...");
    let savedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const savedArticles = [];
    
    for (const article of result.articles) {
      try {
        // 既存記事のチェック
        const existing = await prisma.article.findUnique({
          where: { url: article.url }
        });
        
        if (existing) {
          skippedCount++;
          continue;
        }
        
        // コンテンツのサイズ制限（10KB）
        let content = article.content || '';
        if (content.length > 10000) {
          console.log(`  コンテンツを切り詰め: ${article.title} (${content.length} -> 10000)`);
          content = content.substring(0, 10000);
        }
        
        // タグを作成または取得
        const tags = await Promise.all(
          article.tagNames.map(async (tagName) => {
            return prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName }
            });
          })
        );
        
        // 記事を保存
        const saved = await prisma.article.create({
          data: {
            title: article.title,
            url: article.url,
            summary: article.summary || null,
            content: content,
            thumbnail: article.thumbnail || null,
            publishedAt: article.publishedAt,
            sourceId: article.sourceId,
            author: article.author || null,
            tags: {
              connect: tags.map(tag => ({ id: tag.id }))
            }
          },
          include: {
            tags: true
          }
        });
        
        savedCount++;
        savedArticles.push(saved);
        
        // マネーフォワードの記事を特別にログ出力
        if (saved.url.includes('moneyforward-dev.jp')) {
          console.log(`✅ マネーフォワード記事を保存: ${saved.title}`);
          if (saved.title.includes('SECCON')) {
            console.log(`   🎯 SECCON記事が保存されました！`);
          }
        }
        
      } catch (error) {
        errorCount++;
        console.error(`保存エラー (${article.title}):`, error);
      }
    }
    
    console.log("\n=== 保存結果サマリー ===");
    console.log(`新規保存: ${savedCount}件`);
    console.log(`スキップ（既存）: ${skippedCount}件`);
    console.log(`エラー: ${errorCount}件`);
    
    // マネーフォワードの記事数を確認
    const moneyForwardCount = await prisma.article.count({
      where: {
        url: {
          contains: 'moneyforward-dev.jp'
        }
      }
    });
    
    console.log(`\nマネーフォワード記事の総数: ${moneyForwardCount}件`);
    
    // SECCON記事の確認
    const secconArticle = await prisma.article.findFirst({
      where: {
        title: {
          contains: 'SECCON'
        },
        url: {
          contains: 'moneyforward-dev.jp'
        }
      },
      include: {
        tags: true
      }
    });
    
    if (secconArticle) {
      console.log("\n=== SECCON記事の詳細 ===");
      console.log(`タイトル: ${secconArticle.title}`);
      console.log(`URL: ${secconArticle.url}`);
      console.log(`公開日: ${secconArticle.publishedAt}`);
      console.log(`タグ: ${secconArticle.tags.map(t => t.name).join(', ')}`);
      console.log(`要約: ${secconArticle.summary || '未生成'}`);
    }
    
    return savedArticles;
    
  } catch (error) {
    console.error("エラー:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// メインの実行
if (require.main === module) {
  fetchAndSaveCorporateBlog()
    .then(articles => {
      console.log(`\n処理完了: ${articles.length}件の記事を保存しました`);
      process.exit(0);
    })
    .catch(error => {
      console.error("致命的エラー:", error);
      process.exit(1);
    });
}

export { fetchAndSaveCorporateBlog };