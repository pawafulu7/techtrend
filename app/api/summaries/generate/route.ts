import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { generateSummaryAndTags } from '@/lib/ai/gemini-handler';
import { normalizeTag, normalizeTags } from '@/lib/utils/tag-normalizer';
import { detectArticleType } from '@/lib/utils/article-type-detector';

export async function POST() {
  try {
    // 要約がない記事を取得（最大10件）
    const articlesWithoutSummary = await prisma.article.findMany({
      where: {
        OR: [
          { summary: null },
          { summary: '' },
          { detailedSummary: null },
          { detailedSummary: '' }
        ]
      },
      include: {
        source: true,
        tags: true
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 10
    });

    let generated = 0;
    let errors = 0;

    for (const article of articlesWithoutSummary) {
      try {
        // コンテンツが空の場合はスキップ
        if (!article.content || article.content.trim() === '') {
          console.log(`Skipping article ${article.id} - no content`);
          continue;
        }

        // 要約とタグを生成
        const result = await generateSummaryAndTags(
          article.title,
          article.content
        );

        // 記事タイプを検出
        const articleType = detectArticleType(article.title, article.content);

        // 既存のタグ名を取得
        const existingTagNames = article.tags.map(tag => tag.name);
        
        // 新しいタグを正規化
        const normalizedNewTags = normalizeTags(result.tags);
        
        // 新規タグのみをフィルタ
        const newTagNames = normalizedNewTags.filter(
          tagName => !existingTagNames.includes(tagName)
        );

        // 新規タグを作成または取得
        const tagConnections = [];
        for (const tagName of newTagNames) {
          const tag = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName }
          });
          tagConnections.push({ id: tag.id });
        }

        // 記事を更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            articleType: articleType,
            summaryVersion: 2,
            tags: {
              connect: tagConnections
            }
          }
        });

        generated++;
        console.log(`Generated summary for article ${article.id}: ${article.title}`);
      } catch (error) {
        errors++;
        console.error(`Error generating summary for article ${article.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        generated,
        errors,
        total: articlesWithoutSummary.length
      }
    });
  } catch (error) {
    console.error('Summary generation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate summaries' 
      },
      { status: 500 }
    );
  }
}