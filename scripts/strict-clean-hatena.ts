import { prisma } from '../lib/database';

async function strictCleanHatena() {
  console.log('はてなブックマークの非技術系記事を厳密に削除します...\n');
  
  const hatenaSource = await prisma.source.findFirst({
    where: { name: 'はてなブックマーク' }
  });
  
  if (!hatenaSource) {
    console.log('はてなブックマークのソースが見つかりません');
    return;
  }
  
  const articles = await prisma.article.findMany({
    where: { sourceId: hatenaSource.id },
    orderBy: { publishedAt: 'desc' }
  });
  
  console.log(`現在の記事数: ${articles.length}件\n`);
  
  // 削除対象の記事を特定
  const toDelete = [
    // アニメ・漫画・エンタメ系
    'スーパーマン',
    'こち亀',
    'KING OF PRISM',
    'ミルキー☆サブウェイ',
    'ダンダダン',
    '顔出し無',
    'ユニット',
    
    // 学問・教養系（非技術）
    '文化人類学',
    '動物の感覚',
    '12の感覚',
    
    // 料理・生活系
    '温泉卵',
    '炎天下クッキング',
    
    // 美術・文化系
    '美術館',
    '展覧会',
    '収蔵庫',
    
    // ニュース・社会系
    'トランプ',
    '書評',
    '習慣',
    
    // その他
    '自慢話'
  ];
  
  let deletedCount = 0;
  
  for (const article of articles) {
    const titleLower = article.title.toLowerCase();
    
    // 削除対象キーワードが含まれているか
    const shouldDelete = toDelete.some(keyword => 
      titleLower.includes(keyword.toLowerCase())
    );
    
    // 技術系キーワードを明確に含んでいるかチェック
    const techKeywords = [
      'claude code', 'ai', 'microsoft', 'ハッカー', 'セキュリティ',
      'pixel', '不具合', 'q4os', 'os', 'インストール',
      'ソフトウェア', '開発', 'プログラ', 'エンジニア',
      'api', 'github', 'javascript', 'typescript', 'python'
    ];
    
    const hasTechKeyword = techKeywords.some(keyword => 
      titleLower.includes(keyword.toLowerCase())
    );
    
    // 技術系キーワードがない、または削除対象キーワードがある場合は削除
    if (shouldDelete || !hasTechKeyword) {
      try {
        await prisma.article.delete({
          where: { id: article.id }
        });
        deletedCount++;
        console.log(`削除: ${article.title}`);
      } catch (error) {
        console.error(`削除エラー: ${article.title}`, error);
      }
    }
  }
  
  console.log(`\n削除完了: ${deletedCount}件削除`);
  
  const remaining = await prisma.article.count({
    where: { sourceId: hatenaSource.id }
  });
  
  console.log(`残った記事数: ${remaining}件`);
}

strictCleanHatena()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });