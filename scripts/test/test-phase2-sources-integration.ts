#!/usr/bin/env -S tsx
import { prisma } from '../../lib/prisma';
import { HackerNewsFetcher } from '../../lib/fetchers/hacker-news';
import { MediumEngineeringFetcher } from '../../lib/fetchers/medium-engineering';

/**
 * Phase 2 英語記事ソース統合テスト
 * Hacker NewsとMedium Engineeringの動作確認
 */
async function testPhase2Integration() {
  console.log('🧪 Phase 2 英語記事ソース統合テストを開始...\n');
  
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
          in: ['Hacker News', 'Medium Engineering']
        }
      },
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    if (sources.length === 2) {
      console.log('✅ 全2ソースがデータベースに登録済み');
      sources.forEach(source => {
        console.log(`   - ${source.name}: ${source._count.articles}記事`);
      });
      testResults.passed++;
    } else {
      console.log(`❌ ソース登録不完全: ${sources.length}/2`);
      testResults.failed++;
    }
    
    testResults.details.push({
      test: 'データベース登録',
      status: sources.length === 2 ? 'passed' : 'failed',
      sources: sources.map(s => ({ 
        name: s.name, 
        articles: s._count.articles,
        enabled: s.enabled,
        type: s.type
      }))
    });
  } catch (error) {
    console.error('❌ データベースエラー:', error);
    testResults.failed++;
  }
  
  // Test 2: フェッチャーの動作確認
  console.log('\n📌 Test 2: フェッチャー動作確認');
  
  const fetchers = [
    { name: 'Hacker News', id: 'hacker_news_202508', Fetcher: HackerNewsFetcher },
    { name: 'Medium Engineering', id: 'medium_engineering_202508', Fetcher: MediumEngineeringFetcher }
  ];
  
  for (const { name, id, Fetcher } of fetchers) {
    try {
      let source = await prisma.source.findUnique({
        where: { id }
      });
      
      if (!source) {
        console.log(`⚠️ ${name}: ソースが見つかりません。作成中...`);
        // Create test source if missing
        const sourceData: any = {
          id,
          name,
          type: name === 'Hacker News' ? 'API' : 'RSS',
          enabled: true,
        };
        
        if (name === 'Hacker News') {
          sourceData.url = 'https://hacker-news.firebaseio.com/v0';
        } else if (name === 'Medium Engineering') {
          sourceData.url = 'https://medium.com/feed';
        }
        
        try {
          source = await prisma.source.create({ data: sourceData });
          console.log(`   ✅ ${name}: テストソースを作成`);
        } catch (err) {
          console.error(`   ❌ ${name}: ソース作成失敗`, err);
          testResults.failed++;
          continue;
        }
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
          in: ['Hacker News', 'Medium Engineering']
        }
      },
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    const menuReady = visibleSources.filter(s => s._count.articles > 0);
    
    console.log(`   メニュー表示可能: ${menuReady.length}/2ソース`);
    menuReady.forEach(source => {
      console.log(`   ✅ ${source.name}: 表示可能`);
    });
    
    if (menuReady.length === 2) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    testResults.details.push({
      test: 'メニュー表示条件',
      status: menuReady.length === 2 ? 'passed' : 'failed',
      visibleSources: menuReady.map(s => s.name)
    });
  } catch (error) {
    console.error('❌ メニュー条件確認エラー:', error);
    testResults.failed++;
  }
  
  // Test 5: 全英語ソースの確認
  console.log('\n📌 Test 5: 全英語ソース統合確認');
  try {
    const allEnglishSources = await prisma.source.findMany({
      where: {
        name: {
          in: [
            'GitHub Blog',
            'Cloudflare Blog', 
            'Mozilla Hacks',
            'Hacker News',
            'Medium Engineering'
          ]
        }
      },
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    console.log(`   登録済み英語ソース: ${allEnglishSources.length}/5`);
    allEnglishSources.forEach(source => {
      console.log(`   - ${source.name}: ${source._count.articles}記事`);
    });
    
    if (allEnglishSources.length === 5) {
      console.log('   ✅ 全5つの英語ソースが稼働中');
      testResults.passed++;
    } else {
      console.log('   ❌ 一部のソースが未登録');
      testResults.failed++;
    }
    
    testResults.details.push({
      test: '全英語ソース統合',
      status: allEnglishSources.length === 5 ? 'passed' : 'failed',
      sources: allEnglishSources.map(s => ({
        name: s.name,
        articles: s._count.articles
      }))
    });
  } catch (error) {
    console.error('❌ 統合確認エラー:', error);
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

testPhase2Integration()
  .catch(async (error) => {
    console.error('テストエラー:', error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });