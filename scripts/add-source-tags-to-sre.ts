import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addSourceTagsToSRE() {
  console.log('SRE記事に取得元タグを追加します...');

  try {
    // SRE記事を取得
    const sreArticles = await prisma.article.findMany({
      where: {
        source: { name: 'SRE' }
      },
      include: {
        tags: true
      }
    });

    console.log(`対象記事数: ${sreArticles.length}`);

    // タイトルから取得元を推定
    const sourcePatterns = [
      { pattern: /HashiCorp|Terraform|Vault|Nomad|Consul|Waypoint|Boundary|Packer/i, tag: 'HashiCorp' },
      { pattern: /CNCF|Cloud Native|Kubernetes|Prometheus|Envoy|Istio|Linkerd|Helm|Flux/i, tag: 'CNCF' },
      { pattern: /Grafana|Loki|Tempo|Mimir/i, tag: 'Grafana' },
      { pattern: /SRE Weekly Issue/i, tag: 'SRE Weekly' }
    ];

    let updatedCount = 0;

    for (const article of sreArticles) {
      const currentTags = article.tags.map(t => t.name);
      const newTags: string[] = [];

      // 取得元を推定
      for (const { pattern, tag } of sourcePatterns) {
        if (pattern.test(article.title) && !currentTags.includes(tag)) {
          newTags.push(tag);
          break;
        }
      }

      // 新しいタグがある場合は更新
      if (newTags.length > 0) {
        // 既存のタグIDを取得
        const existingTagIds = article.tags.map(t => ({ id: t.id }));

        // 新しいタグを作成または取得
        const newTagConnections = [];
        for (const tagName of newTags) {
          const tag = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName }
          });
          newTagConnections.push({ id: tag.id });
        }

        // 記事のタグを更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            tags: {
              set: [...existingTagIds, ...newTagConnections]
            }
          }
        });

        updatedCount++;
        console.log(`✓ ${article.title.substring(0, 50)}... -> +${newTags.join(', ')}`);
      }
    }

    console.log(`\n✅ ${updatedCount}件の記事に取得元タグを追加しました`);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addSourceTagsToSRE().catch(console.error);