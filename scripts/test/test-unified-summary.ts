#!/usr/bin/env -S tsx
/**
 * 統一要約生成システムのテストスクリプト
 * 実装された機能の動作検証と品質確認
 */

import { PrismaClient } from '@prisma/client';
import { generateSummaryWithRetry } from '@/lib/ai/summary-generator';
import { 
  checkSummaryQuality,
  generateQualityReport,
  calculateQualityStats
} from '@/lib/utils/summary-quality-checker';
import { generateUnifiedPrompt } from '@/lib/utils/article-type-prompts';

const prisma = new PrismaClient();

// テスト結果を格納
interface TestResult {
  articleId: string;
  title: string;
  summaryLength: number;
  detailedSummaryLength: number;
  qualityScore: number;
  issues: string[];
  passed: boolean;
  regenerationAttempts?: number;
  error?: string;
}

// テスト用のサンプル記事
const testArticles = [
  {
    title: "Next.js 14の新機能App Routerを使ったフルスタックアプリケーション開発",
    content: `Next.js 14がリリースされ、App Routerが安定版となりました。この記事では、App Routerを使用してフルスタックアプリケーションを構築する方法を詳しく解説します。

    App Routerの主な特徴：
    1. サーバーコンポーネントがデフォルト
    2. ネストされたレイアウトのサポート
    3. 並列ルートとインターセプトルート
    4. 改善されたデータフェッチング
    5. ストリーミングとサスペンス

    実装では、React Server Componentsを活用してサーバーサイドでデータを取得し、クライアントへのJavaScript送信量を削減します。また、新しいuseフックとasync/awaitを組み合わせることで、より直感的なデータフェッチングが可能になります。

    パフォーマンス面では、部分的な事前レンダリングにより初期表示が高速化され、Turbopackによるビルド時間も大幅に短縮されています。実際のプロジェクトでは、従来のPages Routerと比較して、初期表示速度が30%向上し、ビルド時間が50%短縮されました。

    App Routerは、現代的なWebアプリケーション開発において重要な選択肢となっており、特に大規模なプロジェクトでその真価を発揮します。`
  },
  {
    title: "TypeScriptの型安全性を最大限に活用するための実践的テクニック",
    content: `TypeScriptの型システムを活用することで、実行時エラーを大幅に削減できます。本記事では、実践的な型安全性向上のテクニックを紹介します。

    1. Branded Typesの活用
    UserId型とPostId型を区別することで、誤った引数渡しを防ぎます。

    2. Template Literal Typesの活用
    文字列リテラル型を組み合わせて、より厳密な型定義を実現します。

    3. Conditional Typesによる型の条件分岐
    ジェネリクスと組み合わせて、柔軟かつ型安全なユーティリティ型を作成します。

    4. Type Guardsの実装
    ランタイムでの型チェックを型システムに反映させます。

    5. Zodによるランタイム検証
    外部APIのレスポンスを型安全に扱うための実践的なアプローチです。

    これらのテクニックを組み合わせることで、型の恩恵を最大限に受けながら、保守性の高いコードベースを構築できます。`
  },
  {
    title: "GitHub ActionsとTerraformでインフラのCI/CDパイプラインを構築",
    content: `Infrastructure as CodeとGitOpsの実践として、GitHub ActionsとTerraformを組み合わせたCI/CDパイプラインの構築方法を解説します。

    パイプラインの構成要素：
    - Terraformによるインフラ定義
    - GitHub Actionsワークフロー
    - AWS/GCP/Azureへの自動デプロイ
    - tfstateの安全な管理
    - 環境別の変数管理

    実装のポイント：
    1. terraform planの結果をPRコメントに自動投稿
    2. mainブランチマージ時の自動apply
    3. tfstateはS3バックエンドで管理
    4. SecretsとEnvironmentsで環境変数を管理
    5. OIDCによる認証でセキュアな接続

    このパイプラインにより、インフラ変更の可視化と安全な自動化を実現し、チーム全体の生産性が向上しました。実際に、インフラ変更のリードタイムが80%短縮され、設定ミスによる障害も90%削減されました。`
  },
  {
    title: "Rustで実装する高性能WebAPIサーバー",
    content: `Rustの所有権システムとゼロコスト抽象化を活用して、高性能なWebAPIサーバーを実装する方法を紹介します。

    使用技術：
    - Axum: 高性能な非同期Webフレームワーク
    - SQLx: コンパイル時SQLチェック
    - Tower: ミドルウェアスタック
    - Tokio: 非同期ランタイム

    パフォーマンス最適化：
    1. ゼロコピーシリアライゼーション
    2. コネクションプーリング
    3. 非同期処理の最適化
    4. メモリアロケーションの削減

    ベンチマーク結果では、同等のNode.js実装と比較して、レスポンスタイムが70%短縮、スループットが3倍向上しました。特に高負荷時の安定性が顕著で、99パーセンタイルレイテンシも一貫して低い値を維持しています。

    Rustの学習曲線は急ですが、型安全性とパフォーマンスの両立を求めるプロジェクトには最適な選択肢です。`
  },
  {
    title: "機械学習モデルをエッジデバイスで動かすためのTensorFlow Lite最適化",
    content: `エッジコンピューティングの需要が高まる中、機械学習モデルをリソース制限のあるデバイスで実行する技術が重要になっています。

    最適化手法：
    1. 量子化（Quantization）
    - INT8量子化でモデルサイズを75%削減
    - 推論速度を2-3倍高速化

    2. プルーニング（Pruning）
    - 重要度の低い重みを削除
    - モデルサイズを50%削減

    3. 知識蒸留（Knowledge Distillation）
    - 大規模モデルから小規模モデルへ知識を転移
    - 精度を維持しながらモデルサイズを90%削減

    実装例：
    画像分類モデルをRaspberry Pi 4で動作させた結果、元のモデルサイズ100MBから8MBまで削減し、推論時間を200msから30msまで短縮しました。精度の低下は2%以内に抑えることができました。

    これらの最適化により、IoTデバイスやモバイルアプリケーションでの機械学習活用が現実的になります。`
  }
];

async function runTest(): Promise<void> {
  console.error('🧪 統一要約生成システムのテストを開始します...\n');
  console.error('=====================================');
  console.error('環境設定:');
  console.error(`  QUALITY_CHECK_ENABLED: ${process.env.QUALITY_CHECK_ENABLED || 'true'}`);
  console.error(`  QUALITY_MIN_SCORE: ${process.env.QUALITY_MIN_SCORE || '70'}`);
  console.error(`  MAX_REGENERATION_ATTEMPTS: ${process.env.MAX_REGENERATION_ATTEMPTS || '3'}`);
  console.error('=====================================\n');

  const results: TestResult[] = [];
  let testIndex = 0;

  // 各記事でテスト実行
  for (const article of testArticles) {
    testIndex++;
    console.error(`\n📝 テスト ${testIndex}/${testArticles.length}: ${article.title.substring(0, 50)}...`);
    console.error('─'.repeat(60));

    const result: TestResult = {
      articleId: `test-${testIndex}`,
      title: article.title,
      summaryLength: 0,
      detailedSummaryLength: 0,
      qualityScore: 0,
      issues: [],
      passed: false
    };

    try {
      // 1. 統一プロンプトの生成テスト
      console.error('  1️⃣ 統一プロンプト生成...');
      const prompt = generateUnifiedPrompt(article.title, article.content);
      console.error(`     ✓ プロンプト生成成功（${prompt.length}文字）`);

      // 2. 要約生成テスト（品質チェック付き）
      console.error('  2️⃣ 要約生成（品質チェック付き）...');
      const startTime = Date.now();
      
      // 環境変数を設定してテスト
      process.env.QUALITY_CHECK_ENABLED = 'true';
      process.env.QUALITY_MIN_SCORE = '70';
      process.env.MAX_REGENERATION_ATTEMPTS = '3';
      
      const summaryResult = await generateSummaryWithRetry(
        article.title,
        article.content
      );
      
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`     ✓ 要約生成成功（${elapsedTime}秒）`);
      
      if (summaryResult.attempts) {
        console.error(`     📊 生成試行回数: ${summaryResult.attempts}回`);
        result.regenerationAttempts = summaryResult.attempts;
      }

      // 3. 生成結果の検証
      console.error('  3️⃣ 生成結果の検証...');
      result.summaryLength = summaryResult.summary.length;
      result.detailedSummaryLength = summaryResult.detailedSummary.length;
      
      console.error(`     一覧要約: ${result.summaryLength}文字`);
      console.error(`     詳細要約: ${result.detailedSummaryLength}文字`);
      console.error(`     タグ: ${summaryResult.tags.join(', ')}`);

      // 4. 品質チェック
      console.error('  4️⃣ 品質チェック...');
      const qualityCheck = checkSummaryQuality(
        summaryResult.summary,
        summaryResult.detailedSummary
      );
      
      result.qualityScore = qualityCheck.score;
      result.issues = qualityCheck.issues.map(i => `[${i.severity}] ${i.message}`);
      result.passed = qualityCheck.isValid;

      console.error(`     スコア: ${result.qualityScore}/100`);
      console.error(`     判定: ${result.passed ? '✅ 合格' : '❌ 不合格'}`);
      
      if (qualityCheck.issues.length > 0) {
        console.error('     問題点:');
        qualityCheck.issues.forEach(issue => {
          const emoji = {
            critical: '🔴',
            major: '🟡', 
            minor: '🔵'
          }[issue.severity];
          console.error(`       ${emoji} ${issue.message}`);
        });
      }

      // 5. 詳細要約のフォーマット確認
      console.error('  5️⃣ フォーマット確認...');
      const lines = summaryResult.detailedSummary.split('\n').filter(l => l.trim());
      // 複数の箇条書き記号に対応
      const bulletMarkers = ['・', '-', '*', '•', '●'];
      const bulletPoints = lines.filter(l => {
        const firstChar = l.trim().charAt(0);
        return bulletMarkers.includes(firstChar) || /^\d+[\.\)]/.test(l.trim());
      });
      const expectedMin = 5; // デフォルト最小値
      console.error(`     箇条書き数: ${bulletPoints.length} (最小: ${expectedMin})`);
      
      if (bulletPoints.length >= expectedMin) {
        console.error('     ✓ フォーマット正常');
      } else {
        console.error('     ✗ フォーマット異常');
      }

    } catch (error) {
      console.error('  ❌ エラーが発生しました:');
      console.error(`     ${error instanceof Error ? error.message : String(error)}`);
      result.error = error instanceof Error ? error.message : String(error);
    }

    results.push(result);
  }

  // テスト結果のサマリー
  console.error('\n\n=====================================');
  console.error('📊 テスト結果サマリー');
  console.error('=====================================\n');

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  const errorCount = results.filter(r => r.error).length;

  console.error(`実行総数: ${results.length}件`);
  console.error(`✅ 成功: ${passedCount}件`);
  console.error(`❌ 失敗: ${failedCount}件`);
  console.error(`🔥 エラー: ${errorCount}件`);

  // 品質統計
  const qualityResults = results
    .filter(r => !r.error)
    .map(r => ({
      score: r.qualityScore,
      isValid: r.passed,
      issues: r.issues.map(i => {
        const match = i.match(/\[(.*?)\]/);
        return {
          type: 'general' as const,
          severity: (match ? match[1] : 'minor') as 'critical' | 'major' | 'minor',
          message: i
        };
      }),
      requiresRegeneration: r.qualityScore < 70
    }));

  if (qualityResults.length > 0) {
    const stats = calculateQualityStats(qualityResults);
    
    console.error('\n📈 品質統計:');
    console.error(`  平均スコア: ${stats.averageScore}/100`);
    console.error(`  合格率: ${Math.round((stats.validCount / qualityResults.length) * 100)}%`);
    console.error(`  再生成率: ${stats.regenerationRate}%`);
    console.error(`  問題の内訳:`);
    console.error(`    Critical: ${stats.criticalIssuesCount}件`);
    console.error(`    Major: ${stats.majorIssuesCount}件`);
    console.error(`    Minor: ${stats.minorIssuesCount}件`);
  }

  // 文字数統計
  const lengthStats = results.filter(r => !r.error);
  if (lengthStats.length > 0) {
    const avgSummaryLength = Math.round(
      lengthStats.reduce((sum, r) => sum + r.summaryLength, 0) / lengthStats.length
    );
    const avgDetailedLength = Math.round(
      lengthStats.reduce((sum, r) => sum + r.detailedSummaryLength, 0) / lengthStats.length
    );

    console.error('\n📏 文字数統計:');
    console.error(`  一覧要約平均: ${avgSummaryLength}文字`);
    console.error(`  詳細要約平均: ${avgDetailedLength}文字`);
    
    // 文字数適合率
    const summaryInRange = lengthStats.filter(r => 
      r.summaryLength >= 150 && r.summaryLength <= 200
    ).length;
    const detailedInRange = lengthStats.filter(r =>
      r.detailedSummaryLength >= 500 && r.detailedSummaryLength <= 700
    ).length;
    
    console.error(`  一覧要約適合率: ${Math.round((summaryInRange / lengthStats.length) * 100)}%`);
    console.error(`  詳細要約適合率: ${Math.round((detailedInRange / lengthStats.length) * 100)}%`);
  }

  // 個別結果の詳細
  console.error('\n📋 個別テスト結果:');
  console.error('─'.repeat(80));
  results.forEach((result, index) => {
    const status = result.error ? '🔥' : (result.passed ? '✅' : '❌');
    console.error(`\n${status} テスト${index + 1}: ${result.title.substring(0, 40)}...`);
    console.error(`  文字数: 一覧${result.summaryLength} / 詳細${result.detailedSummaryLength}`);
    console.error(`  品質スコア: ${result.qualityScore}/100`);
    if (result.regenerationAttempts) {
      console.error(`  再生成試行: ${result.regenerationAttempts}回`);
    }
    if (result.issues.length > 0) {
      console.error(`  問題: ${result.issues.join(', ')}`);
    }
    if (result.error) {
      console.error(`  エラー: ${result.error}`);
    }
  });

  console.error('\n=====================================');
  console.error('✨ テスト完了');
  console.error('=====================================');
}

// メイン実行
async function main() {
  try {
    await runTest();
    process.exitCode = 0;
  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプト直接実行時
if (require.main === module) {
  main();
}


