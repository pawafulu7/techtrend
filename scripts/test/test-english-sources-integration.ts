import { prisma } from '@/lib/prisma';
import { GitHubBlogFetcher } from '@/lib/fetchers/github-blog';
import { CloudflareBlogFetcher } from '@/lib/fetchers/cloudflare-blog';
import { MozillaHacksFetcher } from '@/lib/fetchers/mozilla-hacks';

/**
 * 英語記事ソース統合テスト
 * 新しく追加された3つのソースの動作確認
 */
async function testEnglishSourcesIntegration() {
  console.log('🧪 英語記事ソース統合テストを開始...\n');
  
  const testResults = {
    passed: 0,
    failed: 0,
    details: [] as any[]
  };
  
  // Test 1: データベースにソースが存在するか
  console.log('📌 Test 1: データベース登録確認');
  try {
    const sources = await prisma.source.findMany({
      where: {
        name: {
          in: ['GitHub Blog', 'Cloudflare Blog', 'Mozilla Hacks']
        }
      },
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    if (sources.length === 3) {
      console.log('✅ 全3ソースがデータベースに登録済み');
      sources.forEach(source => {
        console.log(`   - ${source.name}: ${source._count.articles}記事`);
      });
      testResults.passed++;
    } else {
      console.log(`❌ ソース登録不完全: ${sources.length}/3`);
      testResults.failed++;
    }
    
    testResults.details.push({
      test: 'データベース登録',
      status: sources.length === 3 ? 'passed' : 'failed',
      sources: sources.map(s => ({ 
        name: s.name, 
        articles: s._count.articles,
        enabled: s.enabled
      }))
    });
  } catch (error) {
    console.error('❌ データベースエラー:', error);
    testResults.failed++;
  }
  
  // Test 2: フェッチャーの動作確認
  console.log('\n📌 Test 2: フェッチャー動作確認');
  
  const fetchers = [
    { name: 'GitHub Blog', id: 'github_blog_202508', Fetcher: GitHubBlogFetcher },
    { name: 'Cloudflare Blog', id: 'cloudflare_blog_202508', Fetcher: CloudflareBlogFetcher },
    { name: 'Mozilla Hacks', id: 'mozilla_hacks_202508', Fetcher: MozillaHacksFetcher }
  ];
  
  for (const { name, id, Fetcher } of fetchers) {
    try {
      const source = await prisma.source.findUnique({
        where: { id }
      });
      
      if (!source) {
        console.log(`❌ ${name}: ソースが見つかりません`);
        testResults.failed++;
        continue;
      }
      
      const fetcher = new Fetcher(source);
      console.log(`   テスト中: ${name}...`);
      
      // fetch()メソッドが存在するか確認
      if (typeof fetcher.fetch === 'function') {
        console.log(`   ✅ ${name}: フェッチャーが正常に初期化`);
        testResults.passed++;
        
        testResults.details.push({
          test: `${name} フェッチャー`,
          status: 'passed',
          message: 'フェッチャーが正常に初期化'
        });
      } else {
        console.log(`   ❌ ${name}: fetch()メソッドが見つかりません`);
        testResults.failed++;
      }
    } catch (error) {
      console.error(`   ❌ ${name}: エラー`, error);
      testResults.failed++;
    }
  }
  
  // Test 3: 記事の存在確認
  console.log('\n📌 Test 3: 記事の存在確認');
  try {
    for (const { name, id } of fetchers) {
      const articleCount = await prisma.article.count({
        where: { sourceId: id }
      });
      
      if (articleCount > 0) {
        console.log(`   ✅ ${name}: ${articleCount}記事`);
        testResults.passed++;
      } else {
        console.log(`   ⚠️ ${name}: 記事なし`);
        testResults.failed++;
      }
      
      testResults.details.push({
        test: `${name} 記事数`,
        status: articleCount > 0 ? 'passed' : 'failed',
        count: articleCount
      });
    }
  } catch (error) {
    console.error('❌ 記事カウントエラー:', error);
    testResults.failed++;
  }
  
  // Test 4: メニュー表示条件の確認
  console.log('\n📌 Test 4: メニュー表示条件');
  try {
    const visibleSources = await prisma.source.findMany({
      where: { 
        enabled: true,
        name: {
          in: ['GitHub Blog', 'Cloudflare Blog', 'Mozilla Hacks']
        }
      },
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    const menuReady = visibleSources.filter(s => s._count.articles > 0);
    
    console.log(`   メニュー表示可能: ${menuReady.length}/3ソース`);
    menuReady.forEach(source => {
      console.log(`   ✅ ${source.name}: 表示可能`);
    });
    
    if (menuReady.length === 3) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    testResults.details.push({
      test: 'メニュー表示条件',
      status: menuReady.length === 3 ? 'passed' : 'failed',
      visibleSources: menuReady.map(s => s.name)
    });
  } catch (error) {
    console.error('❌ メニュー条件確認エラー:', error);
    testResults.failed++;
  }
  
  // 結果サマリー
  console.log('\n' + '='.repeat(50));
  console.log('📊 テスト結果サマリー');
  console.log('='.repeat(50));
  console.log(`✅ 成功: ${testResults.passed}件`);
  console.log(`❌ 失敗: ${testResults.failed}件`);
  console.log(`📈 成功率: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
  
  // 詳細結果
  console.log('\n📋 詳細結果:');
  console.log(JSON.stringify(testResults.details, null, 2));
  
  // 終了
  await prisma.$disconnect();
  
  // Exit code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

testEnglishSourcesIntegration()
  .catch(async (error) => {
    console.error('テストエラー:', error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });