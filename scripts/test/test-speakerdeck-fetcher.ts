import { SpeakerDeckFetcher } from '../lib/fetchers/speakerdeck';
import { speakerDeckConfig } from '../lib/config/speakerdeck';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// デバッグモードを有効化
speakerDeckConfig.debug = true;
speakerDeckConfig.maxArticles = 5; // テスト用に5件に制限

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
    
    console.error('🔍 Speaker Deck フェッチャーテスト開始...');
    console.error('ソース情報:');
    console.error('  - ID:', source.id);
    console.error('  - Name:', source.name);
    console.error('  - Enabled:', source.enabled);
    console.error('');
    console.error('設定:');
    console.error('  - minViews:', speakerDeckConfig.minViews);
    console.error('  - maxAge:', speakerDeckConfig.maxAge);
    console.error('  - enableDetailFetch:', speakerDeckConfig.enableDetailFetch);
    console.error('');
    
    const fetcher = new SpeakerDeckFetcher(source);
    const result = await fetcher.fetch();
    
    console.error('');
    console.error('📊 取得結果:');
    console.error('  - 記事数:', result.articles.length);
    console.error('  - エラー数:', result.errors.length);
    
    if (result.articles.length > 0) {
      console.error('');
      console.error('📝 取得した記事:');
      result.articles.forEach((article, i) => {
        console.error(`  ${i + 1}. ${article.title}`);
        console.error(`     URL: ${article.url}`);
        console.error(`     日付: ${article.publishedAt.toISOString().split('T')[0]}`);
        console.error(`     著者: ${article.author || 'N/A'}`);
      });
    }
    
    if (result.errors.length > 0) {
      console.error('');
      console.error('❌ エラー:');
      result.errors.forEach(err => console.error('  -', err.message));
    }
  } catch (error) {
    console.error('❌ テスト失敗:', error);
  } finally {
    await prisma.$disconnect();
  }
})();