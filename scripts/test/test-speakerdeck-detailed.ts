import { SpeakerDeckFetcher } from '../lib/fetchers/speakerdeck';
import { speakerDeckConfig } from '../lib/config/speakerdeck';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// デバッグモードを有効化
speakerDeckConfig.debug = false;
speakerDeckConfig.maxArticles = 10; // テスト用に10件に制限

(async () => {
  try {
    // データベースから実際のソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });
    
    if (!source) {
      console.error('❌ Speaker Deckソースが見つかりません');
      process.exit(1);
    }
    
    console.error('🔍 Speaker Deck 最新記事チェック...\n');
    
    const fetcher = new SpeakerDeckFetcher(source);
    const result = await fetcher.fetch();
    
    console.error(`📊 取得結果: ${result.articles.length}件\n`);
    
    // 取得した記事をチェック
    for (const article of result.articles) {
      // URLで既存記事をチェック
      const existing = await prisma.article.findFirst({
        where: { url: article.url }
      });
      
      if (existing) {
        console.error(`❌ 重複: ${article.title}`);
        console.error(`   URL: ${article.url}`);
        console.error(`   既存日付: ${new Date(existing.publishedAt).toISOString().split('T')[0]}`);
        console.error(`   新規日付: ${article.publishedAt.toISOString().split('T')[0]}`);
      } else {
        console.error(`✅ 新規: ${article.title}`);
        console.error(`   URL: ${article.url}`);
        console.error(`   日付: ${article.publishedAt.toISOString().split('T')[0]}`);
      }
      console.error('');
    }
    
    // 最新の記事を確認
    console.error('📅 データベースの最新Speaker Deck記事:');
    const latestArticles = await prisma.article.findMany({
      where: {
        source: { name: 'Speaker Deck' }
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: {
        title: true,
        publishedAt: true,
        url: true
      }
    });
    
    for (const article of latestArticles) {
      console.error(`  - ${new Date(article.publishedAt).toISOString().split('T')[0]}: ${article.title}`);
    }
    
  } catch (error) {
    console.error('❌ テスト失敗:', error);
  } finally {
    await prisma.$disconnect();
  }
})();