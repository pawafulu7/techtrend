import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeTags() {
  console.log('タグの現状を分析中...\n');

  try {
    // 基本統計
    const totalArticles = await prisma.article.count();
    const totalTags = await prisma.tag.count();
    
    // タグ付き記事の統計
    const articlesWithTags = await prisma.article.count({
      where: {
        tags: {
          some: {}
        }
      }
    });
    
    // タグなし記事
    const articlesWithoutTags = totalArticles - articlesWithTags;
    
    console.log('【基本統計】');
    console.log(`- 総記事数: ${totalArticles}`);
    console.log(`- 総タグ数: ${totalTags}`);
    console.log(`- タグ付き記事: ${articlesWithTags} (${((articlesWithTags / totalArticles) * 100).toFixed(1)}%)`);
    console.log(`- タグなし記事: ${articlesWithoutTags} (${((articlesWithoutTags / totalArticles) * 100).toFixed(1)}%)`);
    
    // 記事あたりのタグ数分布
    console.log('\n【記事あたりのタグ数分布】');
    const tagCountDistribution = await prisma.$queryRaw`
      SELECT 
        tag_count,
        COUNT(*) as article_count
      FROM (
        SELECT 
          a.id,
          COUNT(at.B) as tag_count
        FROM Article a
        LEFT JOIN _ArticleToTag at ON a.id = at.A
        GROUP BY a.id
      )
      GROUP BY tag_count
      ORDER BY tag_count ASC
    ` as { tag_count: number; article_count: bigint }[];
    
    tagCountDistribution.forEach(dist => {
      console.log(`- ${dist.tag_count}個のタグ: ${Number(dist.article_count)}記事`);
    });
    
    // タグの種類分析
    console.log('\n【タグの種類分析】');
    const allTags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { articles: true }
        }
      },
      orderBy: {
        articles: {
          _count: 'desc'
        }
      }
    });
    
    // タグを分類
    const sourceTagPatterns = ['AWS', 'SRE', 'HashiCorp', 'CNCF', 'Grafana', 'What\'s New', 'Security Bulletins', 'News Blog', 'SRE Weekly'];
    const sourceTags = allTags.filter(tag => sourceTagPatterns.includes(tag.name));
    const techTags = allTags.filter(tag => !sourceTagPatterns.includes(tag.name));
    
    console.log(`- 取得元タグ: ${sourceTags.length}個`);
    console.log(`- 技術タグ: ${techTags.length}個`);
    
    // 頻出タグ（技術タグのみ）
    console.log('\n【頻出技術タグ Top20】');
    techTags.slice(0, 20).forEach((tag, index) => {
      console.log(`${index + 1}. ${tag.name}: ${tag._count.articles}記事`);
    });
    
    // 1記事にしか使われていないタグ
    const singleUseTags = allTags.filter(tag => tag._count.articles === 1);
    console.log(`\n【低頻度タグ】`);
    console.log(`- 1記事のみ: ${singleUseTags.length}個 (${((singleUseTags.length / totalTags) * 100).toFixed(1)}%)`);
    
    // タグの文字数分析
    const shortTags = allTags.filter(tag => tag.name.length <= 2);
    const longTags = allTags.filter(tag => tag.name.length > 20);
    console.log(`\n【タグの長さ】`);
    console.log(`- 2文字以下: ${shortTags.length}個`);
    console.log(`- 20文字超: ${longTags.length}個`);
    
    // 類似タグの検出
    console.log('\n【類似タグの例】');
    const similarPatterns = [
      { pattern: /^(js|javascript|JS|JavaScript)$/i, name: 'JavaScript' },
      { pattern: /^(ts|typescript|TS|TypeScript)$/i, name: 'TypeScript' },
      { pattern: /^(AI|ai|人工知能|機械学習|ML)$/i, name: 'AI/ML' },
      { pattern: /^(k8s|kubernetes|Kubernetes|K8s)$/i, name: 'Kubernetes' },
    ];
    
    similarPatterns.forEach(({ pattern, name }) => {
      const matches = allTags.filter(tag => pattern.test(tag.name));
      if (matches.length > 1) {
        console.log(`\n${name}関連:`);
        matches.forEach(tag => {
          console.log(`  - "${tag.name}": ${tag._count.articles}記事`);
        });
      }
    });
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

analyzeTags().catch(console.error);