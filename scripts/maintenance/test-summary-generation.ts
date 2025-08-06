import { detectArticleType } from '@/lib/utils/article-type-detector';
import { generatePromptForArticleType } from '@/lib/utils/article-type-prompts';

// テスト用の記事
const testArticle = {
  title: "React 19の新機能：Server ComponentsとActions APIの実装ガイド",
  content: `
    React 19では、開発者の生産性を大幅に向上させる新機能が導入されました。
    特に注目すべきは、Server ComponentsとActions APIです。
    
    Server Componentsは、サーバーサイドでのみ実行されるコンポーネントで、
    クライアントへのJavaScriptバンドルサイズを削減し、パフォーマンスを向上させます。
    
    Actions APIは、フォーム送信やボタンクリックなどのユーザーアクションを
    よりシンプルに処理できる新しいAPIです。
    
    実装例：
    \`\`\`javascript
    // Server Component
    async function ProductList() {
      const products = await fetchProducts();
      return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
    }
    
    // Actions API
    async function updateProduct(formData) {
      'use server';
      const id = formData.get('id');
      await db.products.update({ id, ...data });
    }
    \`\`\`
    
    これらの機能により、React開発はより効率的になります。
  `
};

async function testSummaryGeneration() {
  console.log('=== 要約生成テスト ===\n');
  
  // 記事タイプを判定
  const articleType = detectArticleType(testArticle.title, testArticle.content);
  console.log(`記事タイプ: ${articleType}\n`);
  
  // プロンプトを生成
  const prompt = generatePromptForArticleType(articleType, testArticle.title, testArticle.content);
  
  console.log('生成されたプロンプト（一部）:\n');
  console.log(prompt.substring(0, 500) + '...\n');
  
  // プロンプトに不要な前置き文言の禁止が含まれているか確認
  const hasWarning = prompt.includes('前置き文言を使わない');
  console.log(`前置き文言禁止の指示: ${hasWarning ? '✓ 含まれています' : '✗ 含まれていません'}\n`);
  
  // 詳細要約のフォーマット確認
  const detailFormat = prompt.match(/詳細要約:[\s\S]*?・(.+)/);
  if (detailFormat) {
    console.log('詳細要約の最初の項目:');
    console.log(detailFormat[1]);
  }
}

testSummaryGeneration().catch(console.error);