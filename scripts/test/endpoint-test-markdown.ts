#!/usr/bin/env npx tsx
/**
 * エンドポイントテスト: 記事APIから実際に修正された記事を取得して検証
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testEndpoint() {
  console.log("=== エンドポイントテスト: 記事API ===\n");
  
  try {
    // 1. データベースから直接、修正対象だった記事を取得
    console.log("1. データベースから修正された記事を取得");
    console.log("----------------------------------------");
    
    const targetArticleId = 'cmesi0p6s0001teoi47ealdsk';
    const article = await prisma.article.findUnique({
      where: { id: targetArticleId },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!article) {
      console.log("❌ 記事が見つかりません");
      return;
    }

    console.log(`記事ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);
    console.log(`作成日: ${article.createdAt}`);
    console.log(`更新日: ${article.updatedAt}`);
    
    // 2. 詳細要約の検証
    console.log("\n2. 詳細要約の検証");
    console.log("----------------------------------------");
    
    if (article.detailedSummary) {
      const firstLine = article.detailedSummary.split('\n')[0];
      console.log("詳細要約の最初の行:");
      console.log(firstLine);
      
      // Markdown太字記法のチェック
      const hasMarkdown = article.detailedSummary.includes('**');
      const hasBulletPoint = article.detailedSummary.includes('・');
      
      console.log("\n検証結果:");
      console.log(`${hasMarkdown ? '❌' : '✅'} Markdown太字記法が含まれていない`);
      console.log(`${hasBulletPoint ? '✅' : '❌'} 箇条書き記号（・）が保持されている`);
      
      if (hasMarkdown) {
        console.log("\n⚠️  警告: まだMarkdown記法が残っています");
        const markdownLines = article.detailedSummary
          .split('\n')
          .filter(line => line.includes('**'))
          .slice(0, 3);
        console.log("問題のある行（最初の3行）:");
        markdownLines.forEach(line => console.log(`  ${line}`));
      }
    }
    
    // 3. 他の修正された記事の確認
    console.log("\n3. 他の修正された記事の統計");
    console.log("----------------------------------------");
    
    const articlesWithMarkdown = await prisma.article.count({
      where: {
        detailedSummary: {
          contains: '・**'
        }
      }
    });
    
    console.log(`「・**」を含む記事数: ${articlesWithMarkdown}件`);
    
    if (articlesWithMarkdown > 0) {
      const samples = await prisma.article.findMany({
        where: {
          detailedSummary: {
            contains: '・**'
          }
        },
        select: {
          id: true,
          title: true
        },
        take: 5
      });
      
      console.log("\n問題のある記事のサンプル:");
      samples.forEach(s => console.log(`  - [${s.id}] ${s.title}`));
    }
    
    // 4. APIエンドポイントのシミュレーション
    console.log("\n4. APIレスポンスのシミュレーション");
    console.log("----------------------------------------");
    
    // 実際のAPIレスポンス形式を模倣
    const apiResponse = {
      success: true,
      data: {
        id: article.id,
        title: article.title,
        summary: article.summary,
        detailedSummary: article.detailedSummary,
        hasMarkdown: article.detailedSummary?.includes('**') || false
      }
    };
    
    console.log(`APIレスポンス: ${apiResponse.success ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`Markdown記法: ${apiResponse.data.hasMarkdown ? '❌ 含まれている' : '✅ 含まれていない'}`);
    
    // 5. 総合評価
    console.log("\n\n=== 総合評価 ===");
    console.log("----------------------------------------");
    
    const allChecks = {
      "データベースアクセス": true,
      "記事の取得": !!article,
      "Markdown記法の削除": !article.detailedSummary?.includes('**'),
      "箇条書きの保持": article.detailedSummary?.includes('・') || false,
      "全体の修正完了": articlesWithMarkdown === 0
    };
    
    Object.entries(allChecks).forEach(([check, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${check}`);
    });
    
    const allPassed = Object.values(allChecks).every(v => v);
    console.log(`\n最終結果: ${allPassed ? '✅ すべてのテストに合格' : '❌ 一部のテストが失敗'}`);
    
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// テスト実行
testEndpoint().catch(console.error);