import { prisma } from '../lib/database';

async function checkSummariesQuality() {
  console.log('記事の要約品質をチェックしています...\n');
  
  const articles = await prisma.article.findMany({
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    },
    take: 30 // 最新30件をチェック
  });
  
  console.log(`チェック対象: ${articles.length}件\n`);
  
  const issues = {
    noSummary: [] as any[],
    tooShort: [] as any[],
    meaningless: [] as any[],
    notJapanese: [] as any[],
  };
  
  articles.forEach((article) => {
    const summary = article.summary || '';
    
    // 要約なし
    if (!summary || summary.trim() === '') {
      issues.noSummary.push(article);
      return;
    }
    
    // 短すぎる（20文字未満）
    if (summary.length < 20) {
      issues.tooShort.push(article);
      return;
    }
    
    // 意味不明な要約（一般的な無意味パターン）
    const meaninglessPatterns = [
      /^\.+$/,
      /^…+$/,
      /^記事の要約$/,
      /^要約$/,
      /^この記事は/,
      /^記事URL:/,
    ];
    
    if (meaninglessPatterns.some(pattern => pattern.test(summary))) {
      issues.meaningless.push(article);
      return;
    }
    
    // 日本語でない（英語のみ）
    if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(summary)) {
      issues.notJapanese.push(article);
    }
  });
  
  // 結果を表示
  console.log('=== 問題のある要約 ===\n');
  
  if (issues.noSummary.length > 0) {
    console.log(`【要約なし: ${issues.noSummary.length}件】`);
    issues.noSummary.forEach((article, i) => {
      console.log(`${i + 1}. ${article.title}`);
      console.log(`   ソース: ${article.source.name}`);
      console.log(`   ID: ${article.id}`);
    });
    console.log('');
  }
  
  if (issues.tooShort.length > 0) {
    console.log(`【要約が短すぎる: ${issues.tooShort.length}件】`);
    issues.tooShort.forEach((article, i) => {
      console.log(`${i + 1}. ${article.title}`);
      console.log(`   要約: "${article.summary}"`);
      console.log(`   ID: ${article.id}`);
    });
    console.log('');
  }
  
  if (issues.meaningless.length > 0) {
    console.log(`【意味不明な要約: ${issues.meaningless.length}件】`);
    issues.meaningless.forEach((article, i) => {
      console.log(`${i + 1}. ${article.title}`);
      console.log(`   要約: "${article.summary}"`);
      console.log(`   ID: ${article.id}`);
    });
    console.log('');
  }
  
  if (issues.notJapanese.length > 0) {
    console.log(`【日本語でない要約: ${issues.notJapanese.length}件】`);
    issues.notJapanese.forEach((article, i) => {
      console.log(`${i + 1}. ${article.title}`);
      console.log(`   要約: "${article.summary}"`);
      console.log(`   ID: ${article.id}`);
    });
    console.log('');
  }
  
  // 正常な要約の例
  console.log('=== 正常な要約の例 ===\n');
  const goodSummaries = articles.filter(a => 
    a.summary && 
    a.summary.length >= 20 && 
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(a.summary)
  ).slice(0, 5);
  
  goodSummaries.forEach((article, i) => {
    console.log(`${i + 1}. ${article.title}`);
    console.log(`   要約: ${article.summary}`);
    console.log('');
  });
  
  const totalIssues = issues.noSummary.length + issues.tooShort.length + 
                     issues.meaningless.length + issues.notJapanese.length;
  
  console.log(`\n総計: ${totalIssues}件の問題のある要約`);
}

checkSummariesQuality()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });