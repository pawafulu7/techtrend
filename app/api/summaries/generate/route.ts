import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getUnifiedSummaryService } from '@/lib/ai/unified-summary-service';

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

    // 統一サービスを使用
    const service = getUnifiedSummaryService();

    for (const article of articlesWithoutSummary) {
      try {
        // コンテンツが空の場合はスキップ
        if (!article.content || article.content.trim() === '') {
          continue;
        }

        // 統一フォーマットで要約を生成
        const result = await service.generate(
          article.title,
          article.content
        );

        // 既存のタグ名を取得
        const existingTagNames = article.tags.map(tag => tag.name);
        
        // 新規タグのみをフィルタ
        const newTagNames = result.tags.filter(
          tagName => !existingTagNames.includes(tagName)
        );

        // 新規タグを作成または取得
        const tagConnections: { id: string }[] = [];
        for (const tagName of newTagNames) {
          const tag = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName }
          });
          tagConnections.push({ id: tag.id });
        }

        // 記事を更新（summaryVersion: 5）
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            articleType: result.articleType,
            summaryVersion: result.summaryVersion,
            tags: {
              connect: tagConnections
            }
          }
        });

        generated++;
      } catch (error) {
        errors++;
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
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate summaries' 
      },
      { status: 500 }
    );
  }
}