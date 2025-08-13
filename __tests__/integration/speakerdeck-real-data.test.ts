/**
 * Speaker Deck実データテスト
 * 実際のデータベースのSpeaker Deck記事で要約生成をテスト
 */

import { PrismaClient } from '@prisma/client';
import { analyzeContent } from '../../lib/utils/content-analyzer';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';

const prisma = new PrismaClient();

describe('Speaker Deck Real Data Test', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should analyze actual Speaker Deck articles as thin content', async () => {
    // Speaker Deckの記事を取得
    const speakerDeckSource = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });

    if (!speakerDeckSource) {
      console.log('Speaker Deck source not found, skipping test');
      return;
    }

    const articles = await prisma.article.findMany({
      where: { sourceId: speakerDeckSource.id },
      take: 5
    });

    console.log(`\nAnalyzing ${articles.length} Speaker Deck articles:`);
    
    articles.forEach(article => {
      const content = article.content || '';
      const analysis = analyzeContent(content, 'Speaker Deck');
      
      console.log(`\n- Title: ${article.title.substring(0, 50)}...`);
      console.log(`  Content length: ${content.length}`);
      console.log(`  Current summary length: ${article.summary?.length || 0}`);
      console.log(`  Is thin content: ${analysis.isThinContent}`);
      console.log(`  Recommended: ${analysis.recommendedMinLength}-${analysis.recommendedMaxLength} chars`);
      
      // すべてのSpeaker Deck記事は薄いコンテンツとして扱われるべき
      expect(analysis.isThinContent).toBe(true);
      expect(analysis.recommendedMinLength).toBe(60);
      expect(analysis.recommendedMaxLength).toBe(100);
    });
  });

  it('should generate appropriate prompts for Speaker Deck content', async () => {
    const speakerDeckSource = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });

    if (!speakerDeckSource) {
      console.log('Speaker Deck source not found, skipping test');
      return;
    }

    const article = await prisma.article.findFirst({
      where: { sourceId: speakerDeckSource.id }
    });

    if (!article) {
      console.log('No Speaker Deck articles found, skipping test');
      return;
    }

    const prompt = generateUnifiedPrompt(
      article.title,
      article.content || '',
      'Speaker Deck'
    );

    // 薄いコンテンツ用プロンプトが使用されていることを確認
    expect(prompt).toContain('提供された情報のみを使用');
    expect(prompt).toContain('推測や一般論での補完は絶対に禁止');
    expect(prompt).toContain('最小60文字、最大100文字程度');
    
    console.log('\nGenerated prompt preview:');
    console.log(prompt.substring(0, 300) + '...');
  });

  it('should identify content length issues in existing summaries', async () => {
    const speakerDeckSource = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });

    if (!speakerDeckSource) {
      console.log('Speaker Deck source not found, skipping test');
      return;
    }

    const articles = await prisma.article.findMany({
      where: { 
        sourceId: speakerDeckSource.id,
        summary: { not: null }
      },
      take: 10
    });

    let issueCount = 0;
    const issues: any[] = [];

    articles.forEach(article => {
      const summaryLength = article.summary?.length || 0;
      const contentLength = article.content?.length || 0;
      
      // 問題: 要約がコンテンツより長い
      if (summaryLength > contentLength && contentLength > 0) {
        issueCount++;
        issues.push({
          title: article.title.substring(0, 50),
          contentLength,
          summaryLength,
          issue: 'Summary longer than content'
        });
      }
      
      // 問題: 要約が推奨範囲外
      if (summaryLength > 100) {
        issueCount++;
        issues.push({
          title: article.title.substring(0, 50),
          contentLength,
          summaryLength,
          issue: 'Summary too long for thin content'
        });
      }
    });

    console.log(`\n\nFound ${issueCount} issues in ${articles.length} articles:`);
    issues.forEach(issue => {
      console.log(`\n- ${issue.title}...`);
      console.log(`  Issue: ${issue.issue}`);
      console.log(`  Content: ${issue.contentLength} chars, Summary: ${issue.summaryLength} chars`);
    });

    // 現状では多くの記事が問題を抱えている可能性がある
    // Phase 2で再生成が必要
    expect(issueCount).toBeGreaterThan(0);
  });
});