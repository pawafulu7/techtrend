#!/usr/bin/env tsx
import { createPrismaClient } from '@/lib/prisma/create-client';
import Parser from 'rss-parser';

async function saveMoneyForwardArticles() {
  const prisma = createPrismaClient();
  const parser = new Parser();
  
  console.error("=== マネーフォワード記事を保存 ===");
  
  try {
    // ソースを取得または作成
    let source = await prisma.source.findFirst({
      where: { name: 'Corporate Tech Blog' }
    });
    
    if (!source) {
      source = await prisma.source.create({
        data: {
          name: 'Corporate Tech Blog',
          url: 'https://various-corporate-tech-blogs.com',
          type: 'RSS',
          isActive: true
        }
      });
    }
    
    // RSSフィードを取得
    const feed = await parser.parseURL('https://moneyforward-dev.jp/feed');
    console.error(`RSSフィードから${feed.items?.length || 0}件の記事を取得`);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let savedCount = 0;
    let skippedCount = 0;
    
    // 最大6件の記事を処理
    const articles = [
      { title: "SECCON Beginners CTF 2025 Writeup", url: "https://moneyforward-dev.jp/entry/2025/08/08/103559" },
      { title: "まもなく開発10周年を迎えるアプリケーションのRailsバージョンを7.1から7.2に更新しました", url: "https://moneyforward-dev.jp/entry/2025/07/31/130000" },
      { title: "SRE NEXT 2025 参加レポート ~ SRE じゃないけど参加してみたらたくさんの学びがあった話 ~", url: "https://moneyforward-dev.jp/entry/2025/07/23/204530" },
      { title: "スクラムフェス大阪2025に参加してきました！", url: "https://moneyforward-dev.jp/entry/2025/07/23/113127" },
      { title: "関西Ruby会議08 参加者の声と気づき", url: "https://moneyforward-dev.jp/entry/2025/07/22/140000" },
      { title: "セキュリティチェックシートを自動で回答できるようにした話", url: "https://moneyforward-dev.jp/entry/2025/07/18/150000" }
    ];
    
    for (const articleInfo of articles) {
      const item = feed.items?.find(i => i.link === articleInfo.url);
      if (!item) continue;
      
      try {
        // 既存チェック
        const existing = await prisma.article.findUnique({
          where: { url: item.link! }
        });
        
        if (existing) {
          console.error(`スキップ（既存）: ${item.title}`);
          skippedCount++;
          continue;
        }
        
        // タグを作成
        const tagNames = ['マネーフォワード', '企業テックブログ'];
        const tags = await Promise.all(
          tagNames.map(async (tagName) => {
            return prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName }
            });
          })
        );
        
        // 記事を保存（RSSフィードのコンテンツのみ使用）
        const content = item.content || item.summary || '';
        const publishedAt = item.isoDate ? new Date(item.isoDate) : new Date();
        
        const saved = await prisma.article.create({
          data: {
            title: item.title!,
            url: item.link!,
            summary: null,  // 後で生成
            content: content.substring(0, 5000),  // 5KBに制限
            thumbnail: null,
            publishedAt,
            sourceId: source.id,
            tags: {
              connect: tags.map(tag => ({ id: tag.id }))
            }
          }
        });
        
        console.error(`✅ 保存成功: ${saved.title}`);
        if (saved.title.includes('SECCON')) {
          console.error(`   🎯 SECCON記事が保存されました！`);
        }
        savedCount++;
        
      } catch (error) {
        console.error(`エラー (${item.title}):`, error);
      }
    }
    
    console.error("\n=== 結果 ===");
    console.error(`新規保存: ${savedCount}件`);
    console.error(`スキップ: ${skippedCount}件`);
    
    // 最終確認
    const total = await prisma.article.count({
      where: {
        url: { contains: 'moneyforward-dev.jp' }
      }
    });
    console.error(`\nマネーフォワード記事の総数: ${total}件`);
    
  } catch (error) {
    console.error("エラー:", error);
  } finally {
    await prisma.$disconnect();
  }
}

saveMoneyForwardArticles().catch(console.error);