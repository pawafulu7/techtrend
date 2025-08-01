import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 削除対象のタグ
const tagsToRemove = [
  { name: "", id: "cmdqm0w05000ntel7yxpu04b0", description: "空のタグ" },
  { name: "What's New", id: "cmdqm0w01000mtel71douymxx", description: "英語の新機能タグ" },
  { name: "新機能", id: "cmdqm0w0d000otel7oxi30htf", description: "日本語の新機能タグ" },
  { name: "Updates", id: "cmdqm0w0n000ptel7gx2lfewf", description: "英語の更新タグ" }
];

async function removeAWSRedundantTags() {
  console.log('AWS関連の冗長タグを削除します...\n');
  
  try {
    // 1. 削除前の状態を確認
    console.log('【削除前の確認】');
    console.log('='.repeat(80));
    
    const tagStatsBefore: any[] = [];
    
    for (const tagToRemove of tagsToRemove) {
      // タグの存在確認
      const tag = await prisma.tag.findUnique({
        where: { id: tagToRemove.id },
        include: {
          _count: {
            select: { articles: true }
          }
        }
      });
      
      if (!tag) {
        console.log(`❌ ${tagToRemove.description}「${tagToRemove.name}」(ID: ${tagToRemove.id}) は見つかりませんでした。`);
        continue;
      }
      
      if (tag.name !== tagToRemove.name) {
        console.log(`⚠️  タグ名が一致しません。期待: "${tagToRemove.name}", 実際: "${tag.name}"`);
        continue;
      }
      
      tagStatsBefore.push({
        ...tagToRemove,
        exists: true,
        articleCount: tag._count.articles
      });
      
      console.log(`✅ ${tagToRemove.description}「${tag.name}」`);
      console.log(`   ID: ${tag.id}`);
      console.log(`   記事数: ${tag._count.articles}件`);
    }
    
    if (tagStatsBefore.length === 0) {
      console.log('\n削除対象のタグが見つかりませんでした。');
      return;
    }
    
    // 2. 影響を受ける記事の確認
    console.log('\n【影響を受ける記事の確認】');
    console.log('='.repeat(80));
    
    // すべての削除対象タグが付いている記事を取得
    const articlesWithTags = await prisma.article.findMany({
      where: {
        AND: tagStatsBefore.map(tag => ({
          tags: {
            some: {
              id: tag.id
            }
          }
        }))
      },
      include: {
        source: true,
        tags: true
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`\n削除対象タグがすべて付いている記事: ${articlesWithTags.length}件`);
    
    if (articlesWithTags.length > 0) {
      console.log('\n最初の5件:');
      articlesWithTags.slice(0, 5).forEach((article, index) => {
        const date = article.publishedAt.toISOString().split('T')[0];
        const tags = article.tags.map(t => t.name).join(', ');
        console.log(`${index + 1}. [${date}] ${article.source.name} - ${article.title.substring(0, 40)}...`);
        console.log(`   タグ: ${tags}`);
      });
    }
    
    // 3. 削除処理の実行
    console.log('\n【削除処理を実行】');
    console.log('='.repeat(80));
    
    for (const tagToRemove of tagStatsBefore) {
      console.log(`\n${tagToRemove.description}「${tagToRemove.name}」を処理中...`);
      
      // 記事からタグを切り離す
      const articles = await prisma.article.findMany({
        where: {
          tags: {
            some: {
              id: tagToRemove.id
            }
          }
        },
        select: { id: true }
      });
      
      console.log(`  ${articles.length}件の記事からタグを切り離し中...`);
      
      for (const article of articles) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            tags: {
              disconnect: { id: tagToRemove.id }
            }
          }
        });
      }
      
      console.log(`  ✅ ${articles.length}件の記事からタグを切り離しました`);
      
      // タグを削除
      await prisma.tag.delete({
        where: { id: tagToRemove.id }
      });
      
      console.log(`  ✅ タグを削除しました`);
    }
    
    // 4. 削除後の確認
    console.log('\n【削除後の確認】');
    console.log('='.repeat(80));
    
    // 削除対象タグが本当に削除されたか確認
    for (const tagToRemove of tagsToRemove) {
      const deletedTag = await prisma.tag.findUnique({
        where: { id: tagToRemove.id }
      });
      
      if (deletedTag) {
        console.log(`❌ ${tagToRemove.description}「${tagToRemove.name}」の削除に失敗しました`);
      } else {
        console.log(`✅ ${tagToRemove.description}「${tagToRemove.name}」が正常に削除されました`);
      }
    }
    
    // 影響を受けた記事の最終状態を確認
    if (articlesWithTags.length > 0) {
      console.log('\n【記事の最終状態（最初の記事）】');
      const firstArticle = await prisma.article.findUnique({
        where: { id: articlesWithTags[0].id },
        include: {
          tags: true,
          source: true
        }
      });
      
      if (firstArticle) {
        const remainingTags = firstArticle.tags.map(t => t.name).join(', ');
        console.log(`タイトル: ${firstArticle.title.substring(0, 60)}...`);
        console.log(`残りのタグ: ${remainingTags || 'なし'}`);
      }
    }
    
    // 5. 統計情報
    console.log('\n【処理完了】');
    console.log('='.repeat(80));
    console.log(`削除されたタグ: ${tagStatsBefore.length}個`);
    console.log(`影響を受けた記事: ${articlesWithTags.length}件`);
    console.log('\n✅ AWS関連の冗長タグの削除が完了しました');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数の処理
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
使用方法: npx tsx scripts/remove-aws-redundant-tags.ts

AWS関連の冗長なタグ（空タグ、What's New、新機能、Updates）を一括削除します。

削除対象:
  - 空のタグ ("")
  - What's New
  - 新機能
  - Updates

これらのタグはすべて同じ20記事に付与されており、完全に冗長です。
削除後も「AWS」タグで記事の識別が可能です。

オプション:
  --help  このヘルプを表示
    `);
    process.exit(0);
  }
  
  removeAWSRedundantTags()
    .then(() => {
      console.log('\n処理が完了しました');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { removeAWSRedundantTags };