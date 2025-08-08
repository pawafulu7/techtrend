#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function investigateSummaries() {
  console.log('🔍 要約の調査を開始\n');
  
  try {
    // 1. 特定の2記事をチェック
    console.log('📝 特定記事の確認:');
    console.log('─'.repeat(60));
    
    const specificIds = ['cme2pt2620007tey63yzo2n88', 'cme2f2r9v0005tefmm72ij758'];
    
    for (const id of specificIds) {
      const article = await prisma.article.findUnique({
        where: { id },
        include: { source: true }
      });
      
      if (article) {
        console.log(`\n📄 記事ID: ${id}`);
        console.log(`タイトル: ${article.title.substring(0, 60)}...`);
        console.log(`ソース: ${article.source.name}`);
        console.log(`URL: ${article.url}`);
        console.log(`一覧要約: "${article.summary}"`);
        console.log(`文字数: ${article.summary?.length || 0}`);
        
        // 問題をチェック
        if (article.summary) {
          const problems = [];
          if (article.summary.length < 40) problems.push('短すぎ');
          if (article.summary.length > 150) problems.push('長すぎ');
          if (!article.summary.includes('。') && !article.summary.endsWith('）')) problems.push('句点なし');
          if (article.summary === article.title) problems.push('タイトルと同じ');
          if (article.summary.includes('...') && article.summary.length < 100) problems.push('不要な省略記号');
          
          if (problems.length > 0) {
            console.log(`⚠️ 問題: ${problems.join(', ')}`);
          }
        } else {
          console.log('⚠️ 要約なし');
        }
      } else {
        console.log(`\n❌ 記事ID ${id} が見つかりません`);
      }
    }
    
    // 2. 一覧要約が短い記事を調査
    console.log('\n\n📊 短い要約の記事を調査:');
    console.log('─'.repeat(60));
    
    const shortSummaries = await prisma.article.findMany({
      where: {
        summary: { not: null },
        // Prismaでは直接文字数での絞り込みはできないので、後でフィルタリング
      },
      select: {
        id: true,
        title: true,
        summary: true,
        source: { select: { name: true } }
      },
      orderBy: { publishedAt: 'desc' },
      take: 1000
    });
    
    // 文字数でフィルタリング
    const veryShort = shortSummaries.filter(a => a.summary && a.summary.length < 40);
    const short = shortSummaries.filter(a => a.summary && a.summary.length >= 40 && a.summary.length < 60);
    const titleSame = shortSummaries.filter(a => a.summary === a.title);
    const empty = shortSummaries.filter(a => !a.summary || a.summary.trim() === '');
    
    console.log(`\n📈 要約長さの分布（最新1000件中）:`);
    console.log(`・空または未設定: ${empty.length}件`);
    console.log(`・40文字未満（とても短い）: ${veryShort.length}件`);
    console.log(`・40-59文字（短い）: ${short.length}件`);
    console.log(`・タイトルと同じ: ${titleSame.length}件`);
    
    // とても短い要約の例を表示
    if (veryShort.length > 0) {
      console.log('\n⚠️ とても短い要約の例（40文字未満）:');
      console.log('─'.repeat(60));
      
      for (const article of veryShort.slice(0, 10)) {
        console.log(`\n📄 ${article.title.substring(0, 50)}...`);
        console.log(`   ID: ${article.id}`);
        console.log(`   ソース: ${article.source.name}`);
        console.log(`   要約: "${article.summary}"`);
        console.log(`   文字数: ${article.summary?.length || 0}`);
      }
    }
    
    // タイトルと同じ要約の例
    if (titleSame.length > 0) {
      console.log('\n⚠️ タイトルと同じ要約の例:');
      console.log('─'.repeat(60));
      
      for (const article of titleSame.slice(0, 5)) {
        console.log(`\n📄 ID: ${article.id}`);
        console.log(`   ソース: ${article.source.name}`);
        console.log(`   タイトル/要約: "${article.title}"`);
      }
    }
    
    // 3. ソース別の要約品質統計
    console.log('\n\n📊 ソース別の要約品質統計:');
    console.log('─'.repeat(60));
    
    const sources = await prisma.source.findMany();
    
    for (const source of sources) {
      const articles = await prisma.article.findMany({
        where: { sourceId: source.id },
        select: { summary: true },
        take: 100
      });
      
      if (articles.length === 0) continue;
      
      const stats = {
        total: articles.length,
        empty: articles.filter(a => !a.summary || a.summary.trim() === '').length,
        veryShort: articles.filter(a => a.summary && a.summary.length < 40).length,
        short: articles.filter(a => a.summary && a.summary.length >= 40 && a.summary.length < 60).length,
        good: articles.filter(a => a.summary && a.summary.length >= 60 && a.summary.length <= 120).length,
        long: articles.filter(a => a.summary && a.summary.length > 120).length,
      };
      
      const avgLength = articles
        .filter(a => a.summary)
        .reduce((sum, a) => sum + (a.summary?.length || 0), 0) / (articles.length - stats.empty);
      
      console.log(`\n${source.name}:`);
      console.log(`  サンプル数: ${stats.total}`);
      console.log(`  空: ${stats.empty}, <40文字: ${stats.veryShort}, 40-59文字: ${stats.short}`);
      console.log(`  60-120文字: ${stats.good}, >120文字: ${stats.long}`);
      console.log(`  平均文字数: ${Math.round(avgLength)}`);
      
      if (stats.veryShort > stats.total * 0.2) {
        console.log(`  ⚠️ 短い要約が多い（${Math.round(stats.veryShort / stats.total * 100)}%）`);
      }
    }
    
    // 4. 修正候補のサマリー
    console.log('\n\n💡 修正が必要な記事のサマリー:');
    console.log('─'.repeat(60));
    console.log(`・とても短い要約（<40文字）: ${veryShort.length}件`);
    console.log(`・タイトルと同じ: ${titleSame.length}件`);
    console.log(`・空/未設定: ${empty.length}件`);
    
    const needsFix = veryShort.length + titleSame.length + empty.length;
    if (needsFix > 0) {
      console.log(`\n合計 ${needsFix}件の記事が修正候補です。`);
      console.log('修正コマンド: npx tsx scripts/fix-short-summaries.ts');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

investigateSummaries().catch(console.error);