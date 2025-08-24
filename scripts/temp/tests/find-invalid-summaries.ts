#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findInvalidSummaries() {
  console.error('🔍 簡略化された詳細要約を持つ記事を検索中...\n');
  
  try {
    // 簡略化された形式の特徴的な文言を含む記事を検索
    const invalidArticles = await prisma.article.findMany({
      where: {
        OR: [
          {
            detailedSummary: {
              contains: '実装方法の詳細については、記事内のコード例や手順を参照してください'
            }
          },
          {
            AND: [
              {
                detailedSummary: {
                  contains: '・記事の主題は、'
                }
              },
              {
                detailedSummary: {
                  not: {
                    contains: '・具体的な問題は、'
                  }
                }
              }
            ]
          }
        ]
      },
      select: {
        id: true,
        title: true,
        detailedSummary: true,
        publishedAt: true,
        sourceId: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    console.error(`見つかった記事数: ${invalidArticles.length}\n`);
    
    for (const article of invalidArticles) {
      const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
      console.error(`ID: ${article.id}`);
      console.error(`タイトル: ${article.title}`);
      console.error(`項目数: ${lines.length}`);
      console.error(`公開日: ${article.publishedAt?.toISOString()}`);
      console.error(`ソース: ${article.sourceId}`);
      console.error('-'.repeat(60));
    }
    
    // IDのリストを出力
    if (invalidArticles.length > 0) {
      console.error('\n📋 記事IDリスト（再生成用）:');
      console.error(invalidArticles.map(a => a.id).join(' '));
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findInvalidSummaries().catch(console.error);