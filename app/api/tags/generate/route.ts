import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getUnifiedSummaryService } from '@/lib/ai/unified-summary-service';

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

    // 統一サービスを使用
    const service = getUnifiedSummaryService();

    for (const article of articlesWithoutTags) {
      try {
        // コンテンツが空の場合はスキップ
        if (!article.content || article.content.trim() === '') {
          continue;
        }

        // 統一フォーマットで要約とタグを生成（タグのみ使用）
        const result = await service.generate(
          article.title,
          article.content
        );

        // タグは既に正規化済み
        const normalizedTags = result.tags;

        // タグを作成または取得
        const tagConnections: { id: string }[] = [];
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
        }
      } catch {
        errors++;
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
  } catch {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate tags' 
      },
      { status: 500 }
    );
  }
}