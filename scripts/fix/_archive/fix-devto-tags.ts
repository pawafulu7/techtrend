#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixDevToTags() {
  try {
    console.error('Dev.toのタグ修正処理を開始します...');
    
    // 1文字のタグを検索（不正なタグの可能性が高い）
    const singleCharTags = await prisma.tag.findMany({
      where: {
        name: {
          in: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 
               'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
               ',', ' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
        }
      }
    });
    
    console.error(`不正なタグが${singleCharTags.length}件見つかりました`);
    
    if (singleCharTags.length > 0) {
      console.error('不正なタグ:', singleCharTags.map(t => t.name).join(', '));
      
      // Dev.toソースのIDを取得
      const devtoSource = await prisma.source.findFirst({
        where: {
          name: 'Dev.to'
        }
      });
      
      if (!devtoSource) {
        console.error('Dev.toソースが見つかりません');
        return;
      }
      
      // Dev.toの記事を取得
      const devtoArticles = await prisma.article.findMany({
        where: {
          sourceId: devtoSource.id
        },
        include: {
          tags: true
        }
      });
      
      console.error(`Dev.toの記事が${devtoArticles.length}件見つかりました`);
      
      // 不正なタグを持つ記事を修正
      let fixedCount = 0;
      for (const article of devtoArticles) {
        const hasInvalidTags = article.tags.some(tag => 
          singleCharTags.some(st => st.id === tag.id)
        );
        
        if (hasInvalidTags) {
          console.error(`\n記事を修正中: ${article.title}`);
          console.error(`現在のタグ: ${article.tags.map(t => t.name).join(', ')}`);
          
          // 不正なタグとの関連を削除
          await prisma.$executeRaw`
            DELETE FROM _ArticleToTag 
            WHERE "A" = ${article.id} 
            AND "B" IN (${singleCharTags.map(t => t.id).join(',')})
          `;
          
          fixedCount++;
        }
      }
      
      console.error(`\n${fixedCount}件の記事から不正なタグを削除しました`);
      
      // 使用されていない1文字タグを削除
      for (const tag of singleCharTags) {
        const articleCount = await prisma.$queryRaw<[{count: bigint}]>`
          SELECT COUNT(*) as count FROM _ArticleToTag WHERE "B" = ${tag.id}
        `;
        
        if (Number(articleCount[0].count) === 0) {
          await prisma.tag.delete({
            where: { id: tag.id }
          });
          console.error(`未使用タグを削除: ${tag.name}`);
        }
      }
    }
    
    console.error('\nタグ修正処理が完了しました');
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDevToTags();