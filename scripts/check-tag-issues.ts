import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTagIssues() {
  console.log('タグの問題を調査中...\n');
  
  try {
    // 1. すべてのタグを取得
    const allTags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { articles: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    console.log(`【タグの総数】: ${allTags.length}個\n`);
    
    // 2. 問題のあるタグを検出
    console.log('【問題のあるタグ】');
    console.log('='.repeat(80));
    
    // 空のタグ
    const emptyTags = allTags.filter(tag => !tag.name || tag.name.trim() === '');
    if (emptyTags.length > 0) {
      console.log(`\n空のタグ: ${emptyTags.length}個`);
      emptyTags.forEach(tag => {
        console.log(`  - ID: ${tag.id}, 記事数: ${tag._count.articles}`);
      });
    }
    
    // 短すぎるタグ（2文字以下）
    const shortTags = allTags.filter(tag => tag.name && tag.name.trim().length <= 2);
    if (shortTags.length > 0) {
      console.log(`\n短いタグ（2文字以下）: ${shortTags.length}個`);
      shortTags.forEach(tag => {
        console.log(`  - "${tag.name}" (${tag.name.length}文字), 記事数: ${tag._count.articles}`);
      });
    }
    
    // 長すぎるタグ（30文字以上）
    const longTags = allTags.filter(tag => tag.name && tag.name.length > 30);
    if (longTags.length > 0) {
      console.log(`\n長いタグ（30文字超）: ${longTags.length}個`);
      longTags.forEach(tag => {
        console.log(`  - "${tag.name}" (${tag.name.length}文字), 記事数: ${tag._count.articles}`);
      });
    }
    
    // 特殊文字を含むタグ
    const specialCharTags = allTags.filter(tag => 
      tag.name && /[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF.-]/.test(tag.name)
    );
    if (specialCharTags.length > 0) {
      console.log(`\n特殊文字を含むタグ: ${specialCharTags.length}個`);
      specialCharTags.forEach(tag => {
        console.log(`  - "${tag.name}", 記事数: ${tag._count.articles}`);
      });
    }
    
    // 重複の可能性があるタグ（大文字小文字の違いのみ）
    const tagsByLower = new Map<string, typeof allTags>();
    allTags.forEach(tag => {
      if (tag.name) {
        const lower = tag.name.toLowerCase();
        if (!tagsByLower.has(lower)) {
          tagsByLower.set(lower, []);
        }
        tagsByLower.get(lower)!.push(tag);
      }
    });
    
    const duplicateTags = Array.from(tagsByLower.entries())
      .filter(([_, tags]) => tags.length > 1);
    
    if (duplicateTags.length > 0) {
      console.log(`\n重複の可能性があるタグ: ${duplicateTags.length}グループ`);
      duplicateTags.forEach(([lower, tags]) => {
        console.log(`  グループ "${lower}":`);
        tags.forEach(tag => {
          console.log(`    - "${tag.name}", 記事数: ${tag._count.articles}`);
        });
      });
    }
    
    // 3. タグの使用状況
    console.log('\n【タグの使用状況】');
    console.log('='.repeat(80));
    
    const unusedTags = allTags.filter(tag => tag._count.articles === 0);
    console.log(`未使用のタグ: ${unusedTags.length}個`);
    
    // 使用頻度の分布
    const distribution = {
      '0': 0,
      '1': 0,
      '2-5': 0,
      '6-10': 0,
      '11-20': 0,
      '21+': 0
    };
    
    allTags.forEach(tag => {
      const count = tag._count.articles;
      if (count === 0) distribution['0']++;
      else if (count === 1) distribution['1']++;
      else if (count <= 5) distribution['2-5']++;
      else if (count <= 10) distribution['6-10']++;
      else if (count <= 20) distribution['11-20']++;
      else distribution['21+']++;
    });
    
    console.log('\n使用頻度の分布:');
    Object.entries(distribution).forEach(([range, count]) => {
      console.log(`  ${range}記事: ${count}個のタグ`);
    });
    
    // 4. 最近作成されたタグ（もしcreatedAtがある場合）
    // 注: PrismaスキーマにcreatedAtがない場合はこの部分はスキップ
    
    // 5. サンプル表示
    console.log('\n【すべてのタグ（最初の50個）】');
    console.log('='.repeat(80));
    allTags.slice(0, 50).forEach((tag, index) => {
      console.log(`${index + 1}. "${tag.name}" - ${tag._count.articles}記事`);
    });
    
    if (allTags.length > 50) {
      console.log(`\n... 他 ${allTags.length - 50} 個のタグ`);
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTagIssues();