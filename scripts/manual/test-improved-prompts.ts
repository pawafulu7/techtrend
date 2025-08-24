#!/usr/bin/env tsx
/**
 * LocalLLM向け改善プロンプトテスト
 * 英語思考過程の混入を防ぐための最適化
 */

import fetch from 'node-fetch';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';

interface PromptVariant {
  name: string;
  systemPrompt: string;
  userPromptTemplate: (title: string, content: string) => string;
}

const prompts: PromptVariant[] = [
  {
    name: "厳格日本語版",
    systemPrompt: `あなたは日本語の技術記事分析専門家です。
以下のルールを絶対に守ってください：
1. 出力は100%日本語（技術用語のみ英語可）
2. 思考過程、文字カウント、内部処理を一切出力しない
3. 指定されたフォーマットのみを出力
4. 英語での思考や説明を絶対に含めない
5. "Let me", "I need to", "Count"などの英語フレーズ禁止`,
    userPromptTemplate: (title: string, content: string) => `
技術記事を分析し、以下の形式で日本語のみで出力してください。

タイトル: ${title}
内容: ${content}

【出力形式】
要約: [60-80文字の日本語要約。句点で終了]
タグ: [技術タグ3-5個、カンマ区切り]

【禁止事項】
- 英語の思考過程を出力しない
- 文字数カウントを出力しない
- "Let me think"などの前置きを書かない
- 指定形式以外の文章を追加しない`
  },
  {
    name: "単純指示版",
    systemPrompt: "日本語のみで応答。思考過程は出力禁止。",
    userPromptTemplate: (title: string, content: string) => `
${title}

${content}

要約: [60-80文字]
タグ: [3-5個]

上記形式で日本語のみ出力。`
  },
  {
    name: "JSON形式版",
    systemPrompt: `技術記事分析AI。出力はJSON形式。日本語のみ使用。`,
    userPromptTemplate: (title: string, content: string) => `
記事を分析してJSONで返してください：

タイトル: ${title}
内容: ${content}

出力JSON:
{
  "summary": "60-80文字の日本語要約",
  "tags": ["タグ1", "タグ2", "タグ3"]
}`
  },
  {
    name: "統一フォーマット特化版",
    systemPrompt: `日本語技術記事分析専門。
出力ルール：
- 一覧要約: で始める
- 詳細要約: の後に箇条書き
- タグ: で技術タグ
- 英語禁止（技術用語除く）
- 思考過程出力禁止`,
    userPromptTemplate: (title: string, content: string) => `
タイトル: ${title}
内容: ${content}

以下の形式で出力（日本語のみ）：

一覧要約: [80-120文字で技術的要点をまとめる]

詳細要約:
・この記事の主要なトピックは、[技術的背景と使用技術を説明]
・技術的な背景として、[前提知識や関連技術を説明]
・具体的な実装や手法について、[コード例や設定方法を説明]
・実践する際のポイントは、[注意点や推奨事項を説明]
・今後の展望や応用として、[発展的な内容を説明]

タグ: [技術タグ3-5個]`
  },
  {
    name: "ロール明確化版",
    systemPrompt: `【役割】日本語技術記事要約者
【制約】
・日本語のみ出力
・思考過程は内部処理
・指定形式厳守
・英語フレーズ完全禁止`,
    userPromptTemplate: (title: string, content: string) => `
以下を要約してください。

記事タイトル: ${title}
記事内容: ${content}

出力（この形式のみ）：
要約: [要約内容]
タグ: [タグリスト]`
  }
];

async function testPrompt(
  variant: PromptVariant,
  title: string,
  content: string
): Promise<{
  success: boolean;
  summary: string;
  tags: string[];
  hasEnglish: boolean;
  processingTime: number;
  score: number;
}> {
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${localLLMUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localLLMModel,
        messages: [
          { role: 'system', content: variant.systemPrompt },
          { role: 'user', content: variant.userPromptTemplate(title, content) }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    const output = data.choices[0].message.content;
    const processingTime = Date.now() - startTime;
    
    // 英語混入チェック
    const englishPatterns = [
      /let me/i,
      /I need/i,
      /I will/i,
      /count/i,
      /roughly/i,
      /chars?/i,
      /think/i,
      /first/i,
      /now/i
    ];
    const hasEnglish = englishPatterns.some(pattern => pattern.test(output));
    
    // 結果パース
    let summary = '';
    let tags: string[] = [];
    
    // JSON形式の場合
    if (variant.name === "JSON形式版") {
      try {
        const json = JSON.parse(output);
        summary = json.summary || '';
        tags = json.tags || [];
      } catch {
        // JSON以外の形式で返ってきた場合
      }
    }
    
    // 通常形式の場合
    if (!summary) {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('要約:') || line.includes('一覧要約:')) {
          summary = line.split(':')[1]?.trim() || '';
        } else if (line.includes('タグ:')) {
          const tagLine = line.split(':')[1]?.trim() || '';
          tags = tagLine.split(/[,、，]/).map((t: string) => t.trim()).filter((t: string) => t);
        }
      }
    }
    
    // 品質スコア計算
    const score = summary ? checkSummaryQuality(summary, '').score : 0;
    
    return {
      success: true,
      summary,
      tags,
      hasEnglish,
      processingTime,
      score
    };
    
  } catch (error) {
    return {
      success: false,
      summary: '',
      tags: [],
      hasEnglish: false,
      processingTime: Date.now() - startTime,
      score: 0
    };
  }
}

async function main() {
  console.error('🧪 LocalLLMプロンプト改善テスト\n');
  console.error('================================================================================');
  
  // テスト記事
  const testArticles = [
    {
      title: 'TypeScriptの型安全性を最大化する高度なテクニック',
      content: `
        TypeScriptの型システムを最大限活用することで、ランタイムエラーを大幅に削減できます。
        Conditional Types、Template Literal Types、Mapped Typesなどの高度な機能を組み合わせることで、
        より厳密な型定義が可能になります。特にzodやtRPCなどのライブラリと組み合わせることで、
        APIレスポンスの型安全性も保証できます。これにより開発効率が30%以上向上した事例もあります。
      `
    },
    {
      title: 'Kubernetes上でのマイクロサービス運用ベストプラクティス',
      content: `
        Kubernetesでマイクロサービスを運用する際は、適切なリソース管理が重要です。
        HPA（Horizontal Pod Autoscaler）とVPA（Vertical Pod Autoscaler）を組み合わせることで、
        負荷に応じた自動スケーリングを実現できます。また、Istioなどのサービスメッシュを導入することで、
        サービス間通信の可観測性とセキュリティを向上させることができます。
      `
    }
  ];
  
  console.error(`📝 ${prompts.length}種類のプロンプトを${testArticles.length}記事でテスト\n`);
  
  const results: any[] = [];
  
  for (const article of testArticles) {
    console.error(`\n📄 記事: ${article.title}`);
    console.error('────────────────────────────────────────────────────────────────────────────\n');
    
    for (const prompt of prompts) {
      console.error(`🔸 ${prompt.name}をテスト中...`);
      
      const result = await testPrompt(prompt, article.title, article.content);
      
      results.push({
        article: article.title,
        prompt: prompt.name,
        ...result
      });
      
      if (result.success) {
        console.error(`  ✅ 成功 (${result.processingTime}ms)`);
        console.error(`  📊 スコア: ${result.score}点`);
        console.error(`  🌐 英語混入: ${result.hasEnglish ? '❌ あり' : '✅ なし'}`);
        console.error(`  📝 要約: ${result.summary.substring(0, 50)}...`);
        console.error(`  🏷️  タグ: ${result.tags.join(', ')}`);
      } else {
        console.error(`  ❌ 失敗`);
      }
      
      // API負荷軽減
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // 結果集計
  console.error('\n================================================================================');
  console.error('📊 プロンプト比較結果');
  console.error('================================================================================\n');
  
  const promptStats = prompts.map(p => {
    const promptResults = results.filter(r => r.prompt === p.name && r.success);
    if (promptResults.length === 0) return null;
    
    return {
      name: p.name,
      avgScore: promptResults.reduce((sum, r) => sum + r.score, 0) / promptResults.length,
      avgTime: promptResults.reduce((sum, r) => sum + r.processingTime, 0) / promptResults.length,
      englishRate: promptResults.filter(r => r.hasEnglish).length / promptResults.length,
      successRate: promptResults.length / testArticles.length
    };
  }).filter(s => s !== null);
  
  // ランキング表示
  console.error('【品質スコアランキング】');
  promptStats
    .sort((a, b) => b!.avgScore - a!.avgScore)
    .forEach((stat, i) => {
      console.error(`  ${i + 1}. ${stat!.name}: ${stat!.avgScore.toFixed(1)}点`);
    });
  
  console.error('\n【英語混入率ランキング（低い順）】');
  promptStats
    .sort((a, b) => a!.englishRate - b!.englishRate)
    .forEach((stat, i) => {
      console.error(`  ${i + 1}. ${stat!.name}: ${(stat!.englishRate * 100).toFixed(0)}%`);
    });
  
  console.error('\n【処理速度ランキング】');
  promptStats
    .sort((a, b) => a!.avgTime - b!.avgTime)
    .forEach((stat, i) => {
      console.error(`  ${i + 1}. ${stat!.name}: ${Math.round(stat!.avgTime)}ms`);
    });
  
  // 最適プロンプトの推奨
  const bestPrompt = promptStats
    .filter(s => s!.englishRate === 0)
    .sort((a, b) => b!.avgScore - a!.avgScore)[0];
  
  if (bestPrompt) {
    console.error('\n✨ 推奨プロンプト');
    console.error('────────────────────────────────────────────────────────────────────────────');
    console.error(`  ${bestPrompt.name}`);
    console.error(`  - 品質スコア: ${bestPrompt.avgScore.toFixed(1)}点`);
    console.error(`  - 英語混入: なし`);
    console.error(`  - 処理速度: ${Math.round(bestPrompt.avgTime)}ms`);
  }
  
  console.error('\n✅ テスト完了！');
}

// 実行
main().catch(console.error);