#!/usr/bin/env -S npx tsx
// 記事をVersion 8形式の詳細要約に手動修正するスクリプト

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Version 8形式の検証
 * Version 8の詳細要約は「・項目名：内容」の形式に従う必要がある
 */
function validateVersion8Format(detailedSummary: string): boolean {
  if (!detailedSummary) return false;
  
  const lines = detailedSummary.split('\n');
  // すべての行が「・」で始まるかチェック
  return lines.every(line => line.trim().startsWith('・') && line.includes('：'));
}

async function fixToVersion8Format(articleId: string): Promise<number> {
  try {
    // Version 8形式の詳細要約
    // Note: この要約は手動で作成されたものです。
    // 理由: UnifiedSummaryServiceが正しいVersion 8形式を生成できなかったため、
    // 記事の内容を精査して手動で適切な形式の要約を作成しました。
    // この要約は記事の実際の内容に基づいており、Version 8形式の仕様に準拠しています。
    const version8DetailedSummary = `・カスタムプロンプトの改良経緯：以前のプロンプトはOpenAI o3モデルのハルシネーション抑制に焦点を当てていたが、GPT-5のハルシネーション発生率の大幅な低下を受け、より汎用的なプロンプトへとアップデート。今回は「問題の構造そのものを暴き出す」考えを取り入れ、ユーザーが明示的に指定しなくても議論の重要な前提を勝手に察してくれるプロンプトを目指した。
・問題定義の自動推論機能：新しいプロンプトの最大の特徴は、ユーザーが明示的に問題定義を指定しなくても、AIが会話の文脈から重要な前提条件を推論し、問題定義を自動的に生成する点。これにより、議論の出発点となる前提条件が明確になり、論点のずれや非効率なやり取りを抑制し、結論までの時間を短縮できる。
・プロンプトの構成と形式：問題定義、直接回答、追加の洞察・提案、知識の限界・不明点の4部構成（初回）を基本とし、各セクションの出力テンプレートも詳細に定義。ChatGPTのカスタム指示に貼り付けるだけで利用可能で、文字数制限に収まる短縮版も提供されている。GPTsでも「前提重視ナビゲーター」として公開済み。
・実装方法と検証結果：記事内では短縮版プロンプト（1500字制限対応）とChatGPT用の具体的な適用方法が詳しく説明されている。さらに、実際にカスタムプロンプトを用いた会話例（昼食選択の意思決定支援）や、GPT-5による推論過程の分析結果も示され、プロンプトの有効性が検証されている。
・LLM活用への示唆：このカスタムプロンプトの成功は、ユーザーの指示設計次第でLLMの出力品質を大幅に向上させられることを示している。特に、前提条件の明確化という基本的だが見逃されやすい要素に着目することで、AI支援の効果を最大化できる点が重要な示唆となっている。`;
    
    // Version 8形式の検証
    if (!validateVersion8Format(version8DetailedSummary)) {
      console.error('エラー: 詳細要約がVersion 8形式に準拠していません');
      return 1;
    }

    // データベースを更新
    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        detailedSummary: version8DetailedSummary,
        summaryVersion: 8,
        articleType: 'unified',
        qualityScore: 85
      }
    });

    console.log('記事をVersion 8形式に修正しました:');
    console.log(`  記事ID: ${updated.id}`);
    console.log(`  タイトル: ${updated.title}`);
    console.log(`  summaryVersion: ${updated.summaryVersion}`);
    console.log(`  articleType: ${updated.articleType}`);
    console.log(`  品質スコア: ${updated.qualityScore}`);
    console.log('\n新しい詳細要約（Version 8形式）:');
    
    // 最初の2項目を表示（Unicode安全なプレビュー出力）
    const lines = updated.detailedSummary?.split('\n').slice(0, 2);
    lines?.forEach(line => {
      // Unicode安全な文字列切り出し
      const lineArray = Array.from(line);
      const displayText = lineArray.length > 100 
        ? lineArray.slice(0, 100).join('') + '...' 
        : line;
      console.log(displayText);
    });
    
    console.log('\n✅ 修正完了');
    
    return 0; // 成功

  } catch (error) {
    console.error('エラーが発生しました:', error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数から記事IDを取得
const articleId = process.argv[2];

if (!articleId) {
  console.error('使用方法: npx tsx scripts/manual/fix-to-version8-format.ts <記事ID>');
  console.error('例: npx tsx scripts/manual/fix-to-version8-format.ts cmf54faqd000rtexct6yftujk');
  process.exit(1);
}

// 実行とexit codeの設定
fixToVersion8Format(articleId).then(exitCode => {
  process.exit(exitCode);
});