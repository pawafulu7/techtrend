import { PrismaClient } from '@prisma/client';
import { getAppDependencies } from '@/lib/di/bootstrap';

const prisma = new PrismaClient();

async function testRealArticle() {
  console.log('🔍 Testing with real article from database...\n');

  try {
    // 指定されたIDの記事を取得
    const articleId = 'cmg0uph8z0003teuxmugcbn1r';
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        url: true,
        summary: true,
        detailedSummary: true,
        tags: true,
        qualityScore: true,
        summaryVersion: true,
        content: true,
      },
    });

    if (!article) {
      console.error('❌ 記事が見つかりません:', articleId);
      process.exit(1);
    }

    console.log('📝 既存の記事情報:');
    console.log('  ID:', article.id);
    console.log('  タイトル:', article.title);
    console.log('  URL:', article.url);
    console.log('  要約バージョン:', article.summaryVersion);
    console.log('  スコア:', article.qualityScore);
    console.log('  コンテンツ長:', article.content?.length || 0, '文字');
    console.log('\n現在の要約:');
    console.log('  一覧:', article.summary?.substring(0, 100) + '...');
    console.log('  詳細:', article.detailedSummary?.substring(0, 100) + '...');
    console.log('  タグ数:', article.tags.length);

    if (!article.content) {
      console.error('❌ 記事コンテンツが見つかりません');
      process.exit(1);
    }

    console.log('\n⏳ 新しい要約を生成中...');
    const { service } = getAppDependencies();
    const startTime = Date.now();

    const result = await service.generateSummary({
      title: article.title,
      content: article.content,
      qualityThreshold: 40,
    });

    const duration = Date.now() - startTime;

    console.log('\n✅ 要約生成成功！\n');
    console.log('='.repeat(60));
    console.log('📌 新しい一覧要約 (summary):');
    console.log('='.repeat(60));
    console.log(result.summary);
    console.log('\n' + '='.repeat(60));
    console.log('📄 新しい詳細要約 (detailedSummary):');
    console.log('='.repeat(60));
    console.log(result.detailedSummary);
    console.log('\n' + '='.repeat(60));
    console.log('📊 比較:');
    console.log('='.repeat(60));
    console.log('旧スコア:', article.qualityScore, '→ 新スコア:', result.qualityScore);
    console.log('旧バージョン:', article.summaryVersion, '→ 新バージョン:', result.summaryVersion);
    console.log('旧タグ数:', article.tags.length, '→ 新タグ数:', result.tags.length);
    console.log('新タグ:', result.tags.join(', '));
    console.log('カテゴリ:', result.category);
    console.log('処理時間:', duration, 'ms');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ エラー:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testRealArticle();
