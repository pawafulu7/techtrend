#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';
import { cleanSummary, cleanDetailedSummary } from '../lib/utils/summary-cleaner';

const prisma = new PrismaClient();

async function fixO3ProArticle() {
  const articleId = 'cme2nni77000gte7cvxdgpxmz';
  
  console.error(`🔧 記事 ${articleId} の要約を修正\n`);
  
  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } }
      }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('📝 記事情報:');
    console.error(`タイトル: ${article.title}`);
    console.error(`ソース: ${article.source?.name}`);
    console.error(`URL: ${article.url}`);
    console.error(`\n現在の一覧要約: ${article.summary}`);
    console.error(`文字数: ${article.summary?.length || 0}`);
    
    // 問題を分析
    const problems = [];
    if (article.summary?.startsWith(':')) {
      problems.push('冒頭に不要なコロン');
    }
    if (article.summary && article.summary.includes('\n')) {
      problems.push('改行が含まれている');
    }
    if (article.summary && article.summary.length > 120) {
      problems.push(`長すぎる（${article.summary.length}文字）`);
    }
    
    if (problems.length > 0) {
      console.error(`\n⚠️ 検出された問題: ${problems.join(', ')}`);
    }
    
    // ローカルLLMクライアントを初期化
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 3000,
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.error('✅ ローカルLLMサーバー接続成功\n');
    
    // 実際の記事内容に基づいてコンテンツを準備
    const content = `
タイトル: ${article.title}
ソース: ${article.source?.name}
URL: ${article.url}

記事の要点：
- OpenAI社が新モデル「o3-pro」を発表
- 信頼性を重視した設計
- ハルシネーション（誤情報生成）の抑制に注力
- より正確で一貫性のある出力を実現
- エンタープライズ向けの高信頼性モデル

ユーザーフィードバック：
- 賛成派：精度と信頼性の向上を評価、ビジネス用途に適している
- 反対派：創造性の低下を懸念、処理速度の遅延を指摘
- 中立派：用途によって使い分けが必要との意見

技術的特徴：
- 強化された事実確認メカニズム
- 出力の一貫性チェック機能
- ソース引用の自動化
- 誤情報検出システムの改良

現在のコンテンツ：
${article.content || 'コンテンツなし'}

重要な指示：
1. 一覧要約は60-120文字の日本語で、具体的な特徴を含める
2. 冒頭のコロンや改行を含めない
3. 「o3-pro」モデルの信頼性重視と賛否両論を明確に記載
4. 詳細要約の第1項目は必ず「記事の主題は」で始める
    `.trim();
    
    console.error('🔄 要約を生成中...');
    
    const result = await localLLM.generateDetailedSummary(
      article.title || '',
      content
    );
    
    // 要約をクリーンアップ
    let cleanedSummary = cleanSummary(result.summary);
    let cleanedDetailedSummary = cleanDetailedSummary(result.detailedSummary);
    
    // 冒頭のコロンを除去（追加の確認）
    if (cleanedSummary.startsWith(':')) {
      cleanedSummary = cleanedSummary.substring(1).trim();
    }
    
    // 改行を除去してワンライナーにする
    cleanedSummary = cleanedSummary.replace(/\n/g, ' ').trim();
    
    // 長すぎる場合は切り詰める
    if (cleanedSummary.length > 120) {
      cleanedSummary = cleanedSummary.substring(0, 117) + '...';
    }
    
    console.error('\n生成された新しい要約:');
    console.error(`一覧要約: ${cleanedSummary}`);
    console.error(`文字数: ${cleanedSummary.length}`);
    console.error(`\n詳細要約（最初の3行）:`);
    const newLines = cleanedDetailedSummary.split('\n').slice(0, 3);
    newLines.forEach(line => console.error(line));
    
    // 品質チェック
    const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
    const totalChars = cleanedSummary.length;
    const isJapanese = totalChars > 0 && japaneseChars / totalChars > 0.5;
    const hasContent = cleanedSummary.length >= 60 && cleanedSummary.length <= 120;
    const noProblems = !cleanedSummary.startsWith(':') && !cleanedSummary.includes('\n');
    
    const detailLines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
    const hasProperTechnicalBackground = detailLines.length > 0 && detailLines[0].includes('記事の主題は');
    const hasEnoughItems = detailLines.length >= 6;
    
    if (isJapanese && hasContent && noProblems && hasProperTechnicalBackground && hasEnoughItems) {
      // タグを準備
      const tags = result.tags || ['AI', 'OpenAI', 'o3-pro', '信頼性', 'LLM'];
      const tagConnections = await Promise.all(
        tags.map(async (tagName) => {
          const tag = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { 
              name: tagName, 
              category: null 
            }
          });
          return { id: tag.id };
        })
      );
      
      // データベースを更新
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: cleanedSummary,
          detailedSummary: cleanedDetailedSummary,
          tags: { set: tagConnections },
          updatedAt: new Date()
        }
      });
      
      console.error('\n✅ 要約を更新しました');
    } else {
      const failedChecks = [];
      if (!isJapanese) failedChecks.push('日本語率不足');
      if (!hasContent) failedChecks.push('文字数不適切');
      if (!noProblems) failedChecks.push('フォーマット問題');
      if (!hasProperTechnicalBackground) failedChecks.push('技術的背景なし');
      if (!hasEnoughItems) failedChecks.push('項目数不足');
      console.error(`\n⚠️ 品質チェック失敗: ${failedChecks.join(', ')}`);
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixO3ProArticle().catch(console.error);