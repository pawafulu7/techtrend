import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { generateSummaryAndTags } from '@/lib/ai/gemini-handler';
import { normalizeTag, normalizeTags } from '@/lib/utils/tag-normalizer';

export async function POST() {
  try {
    // タグがない記事を取得（最大10件）
    const articlesWithoutTags = await prisma.article.findMany({
      where: {
        tags: {
          none: {}
        }
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

    for (const article of articlesWithoutTags) {
      try {
        // コンテンツが空の場合はスキップ
        if (!article.content || article.content.trim() === '') {
          console.log(`Skipping article ${article.id} - no content`);
          continue;
        }

        // 要約とタグを生成（タグのみ使用）
        const result = await generateSummaryAndTags(
          article.title,
          article.content
        );

        // タグを正規化
        const normalizedTags = normalizeTags(result.tags);

        // タグを作成または取得
        const tagConnections = [];
        for (const tagName of normalizedTags) {
          const tag = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName }
          });
          tagConnections.push({ id: tag.id });
        }

        // 記事にタグを追加
        if (tagConnections.length > 0) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                connect: tagConnections
              }
            }
          });
          generated++;
          console.log(`Generated tags for article ${article.id}: ${normalizedTags.join(', ')}`);
        }
      } catch (error) {
        errors++;
        console.error(`Error generating tags for article ${article.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        generated,
        errors,
        total: articlesWithoutTags.length
      }
    });
  } catch (error) {
    console.error('Tag generation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate tags' 
      },
      { status: 500 }
    );
  }
}