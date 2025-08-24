#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ProblematicPattern {
  pattern: string;
  description: string;
  articles: Array<{
    id: string;
    title: string;
    source: string;
    summary: string | null;
    detailedSummary: string | null;
  }>;
}

async function deepCheckSummaries() {
  console.error('🔍 要約の深層チェックを開始\n');
  
  try {
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { not: null } },
          { detailedSummary: { not: null } }
        ]
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } }
      },
      orderBy: { publishedAt: 'desc' },
      take: 2000 // 最新2000件をチェック
    });
    
    console.error(`📊 チェック対象: ${articles.length}件\n`);
    
    const patterns: ProblematicPattern[] = [
      {
        pattern: 'html_entities',
        description: 'HTMLエンティティ（&amp;, &lt;, &gt;, &quot;）',
        articles: []
      },
      {
        pattern: 'english_mixed',
        description: '英語の思考過程混入（Then, Let\'s, We need等）',
        articles: []
      },
      {
        pattern: 'quote_as_summary',
        description: '記事内容の引用がそのまま要約',
        articles: []
      },
      {
        pattern: 'incomplete_sentence',
        description: '文が途中で切れている（。なしで終了）',
        articles: []
      },
      {
        pattern: 'duplicate_punctuation',
        description: '重複句読点（。。、、、）',
        articles: []
      },
      {
        pattern: 'strange_format',
        description: '不自然なフォーマット（改行、空白の異常）',
        articles: []
      },
      {
        pattern: 'generation_failure',
        description: '生成失敗パターン（仮に、仮定して等）',
        articles: []
      },
      {
        pattern: 'metadata_leak',
        description: 'メタデータ混入（分析、要約:、技術記事分析等）',
        articles: []
      },
      {
        pattern: 'extremely_short',
        description: '極端に短い（20文字未満）',
        articles: []
      },
      {
        pattern: 'title_duplicate',
        description: 'タイトルとほぼ同じ',
        articles: []
      },
      {
        pattern: 'missing_detail_items',
        description: '詳細要約の項目不足（3個以下）',
        articles: []
      },
      {
        pattern: 'wrong_language',
        description: '英語のまま（日本語率30%未満）',
        articles: []
      }
    ];
    
    // 各記事をチェック
    for (const article of articles) {
      const summary = article.summary || '';
      const detailedSummary = article.detailedSummary || '';
      
      // HTMLエンティティ
      if (summary.includes('&amp;') || summary.includes('&lt;') || 
          summary.includes('&gt;') || summary.includes('&quot;') ||
          summary.includes('&#39;') || summary.includes('&nbsp;')) {
        patterns[0].articles.push(article);
      }
      
      // 英語の思考過程
      if (summary.match(/\b(Then|Let's|We need|We can|I need|I think|So |Therefore|However)\b/i) ||
          summary.includes('we can generalize') ||
          summary.includes('detailed sections')) {
        patterns[1].articles.push(article);
      }
      
      // 記事内容の引用
      if (summary.includes('記事内容が「') || 
          summary.includes('内容は「') ||
          summary.match(/^「.*」$/)) {
        patterns[2].articles.push(article);
      }
      
      // 不完全な文
      if (summary.length > 20 && 
          !summary.endsWith('。') && 
          !summary.endsWith('）') && 
          !summary.endsWith('」') &&
          !summary.endsWith('！') &&
          !summary.endsWith('？') &&
          !summary.match(/[a-zA-Z0-9]$/)) {
        patterns[3].articles.push(article);
      }
      
      // 重複句読点
      if (summary.includes('。。') || summary.includes('、、') || 
          summary.includes('。、') || summary.includes('、。')) {
        patterns[4].articles.push(article);
      }
      
      // 不自然なフォーマット
      if (summary.includes('\n\n') || 
          summary.includes('   ') || 
          summary.match(/^\s+/) ||
          summary.match(/\s{3,}/)) {
        patterns[5].articles.push(article);
      }
      
      // 生成失敗
      if (summary.includes('仮に記事内容が') || 
          summary.includes('仮定して') ||
          summary.includes('以下の通りだと仮定') ||
          summary.includes('想定される内容')) {
        patterns[6].articles.push(article);
      }
      
      // メタデータ混入
      if (summary.includes('分析\n') || 
          summary.includes('要約:') ||
          summary.includes('技術記事分析') ||
          summary.includes('に関する分析') ||
          summary.includes('詳細要約:')) {
        patterns[7].articles.push(article);
      }
      
      // 極端に短い
      if (summary.length > 0 && summary.length < 20) {
        patterns[8].articles.push(article);
      }
      
      // タイトルとほぼ同じ
      if (summary === article.title || 
          (summary.length > 0 && Math.abs(summary.length - article.title.length) < 5 &&
           summary.substring(0, 20) === article.title.substring(0, 20))) {
        patterns[9].articles.push(article);
      }
      
      // 詳細要約の項目不足
      if (detailedSummary) {
        const items = detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (items.length > 0 && items.length <= 3) {
          patterns[10].articles.push(article);
        }
      }
      
      // 英語のまま
      if (summary.length > 0) {
        const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const japaneseRatio = japaneseChars / summary.length;
        if (japaneseRatio < 0.3) {
          patterns[11].articles.push(article);
        }
      }
    }
    
    // 結果表示
    console.error('📈 問題パターン別統計:');
    console.error('─'.repeat(80));
    
    let totalProblematic = 0;
    const problemArticleIds = new Set<string>();
    
    for (const pattern of patterns) {
      if (pattern.articles.length > 0) {
        console.error(`\n【${pattern.description}】: ${pattern.articles.length}件`);
        totalProblematic += pattern.articles.length;
        
        // 重複を除いたユニークな記事IDを記録
        pattern.articles.forEach(a => problemArticleIds.add(a.id));
        
        // 最初の3件を例として表示
        for (let i = 0; i < Math.min(3, pattern.articles.length); i++) {
          const article = pattern.articles[i];
          console.error(`  ${i + 1}. ${article.title.substring(0, 40)}...`);
          console.error(`     ID: ${article.id}`);
          console.error(`     ソース: ${article.source.name}`);
          
          if (pattern.pattern === 'html_entities' || 
              pattern.pattern === 'english_mixed' ||
              pattern.pattern === 'quote_as_summary') {
            const preview = article.summary?.substring(0, 80).replace(/\n/g, '\\n');
            console.error(`     要約: "${preview}..."`);
          }
        }
      }
    }
    
    // サマリー
    console.error('\n' + '='.repeat(80));
    console.error('📊 問題サマリー:');
    console.error(`・チェック対象: ${articles.length}件`);
    console.error(`・問題のある記事（ユニーク）: ${problemArticleIds.size}件`);
    console.error(`・問題率: ${(problemArticleIds.size / articles.length * 100).toFixed(1)}%`);
    
    // 最も問題の多いパターントップ5
    const sortedPatterns = patterns
      .filter(p => p.articles.length > 0)
      .sort((a, b) => b.articles.length - a.articles.length)
      .slice(0, 5);
    
    console.error('\n⚠️ 最も多い問題パターン（トップ5）:');
    for (let i = 0; i < sortedPatterns.length; i++) {
      const pattern = sortedPatterns[i];
      console.error(`${i + 1}. ${pattern.description}: ${pattern.articles.length}件`);
    }
    
    // 複数の問題を持つ記事を特定
    const multiProblemArticles: Map<string, string[]> = new Map();
    
    for (const pattern of patterns) {
      for (const article of pattern.articles) {
        if (!multiProblemArticles.has(article.id)) {
          multiProblemArticles.set(article.id, []);
        }
        multiProblemArticles.get(article.id)?.push(pattern.description);
      }
    }
    
    const severeProblemArticles = Array.from(multiProblemArticles.entries())
      .filter(([_, problems]) => problems.length >= 3)
      .sort((a, b) => b[1].length - a[1].length);
    
    if (severeProblemArticles.length > 0) {
      console.error('\n🚨 複数の問題を持つ記事（3つ以上）:');
      for (let i = 0; i < Math.min(5, severeProblemArticles.length); i++) {
        const [id, problems] = severeProblemArticles[i];
        const article = articles.find(a => a.id === id);
        if (article) {
          console.error(`\n${i + 1}. ${article.title.substring(0, 50)}...`);
          console.error(`   ID: ${id}`);
          console.error(`   問題数: ${problems.length}`);
          console.error(`   問題: ${problems.join(', ')}`);
        }
      }
    }
    
    // 修正提案
    if (problemArticleIds.size > 0) {
      console.error('\n💡 修正提案:');
      console.error('1. HTMLエンティティの修正: npx tsx scripts/fix-html-entities.ts');
      console.error('2. 英語混在の修正: npx tsx scripts/fix-english-mixed.ts');
      console.error('3. 全問題の一括修正: npx tsx scripts/fix-all-deep-problems.ts');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deepCheckSummaries().catch(console.error);