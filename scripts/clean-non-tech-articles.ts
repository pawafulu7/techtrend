import { prisma } from '../lib/database';

const techKeywords = [
  // プログラミング言語
  'javascript', 'typescript', 'python', 'java', 'ruby', 'go', 'rust', 'php', 'swift', 'kotlin',
  'c++', 'c#', 'scala', 'elixir', 'haskell', 'clojure', 'dart', 'julia', 'r言語',
  
  // フレームワーク・ライブラリ
  'react', 'vue', 'angular', 'next.js', 'nuxt', 'svelte', 'node.js', 'express', 'django',
  'rails', 'spring', 'laravel', 'flask', 'fastapi', 'gin', 'echo',
  
  // インフラ・クラウド
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins',
  'github', 'gitlab', 'circleci', 'cloudflare', 'vercel', 'netlify',
  
  // データベース
  'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'firestore',
  'sqlite', 'prisma', 'typeorm', 'sequelize',
  
  // AI・機械学習
  'ai', '機械学習', 'ディープラーニング', 'chatgpt', 'gpt', 'llm', 'tensorflow',
  'pytorch', 'scikit-learn', 'pandas', 'numpy', 'jupyter',
  
  // その他技術用語
  'api', 'rest', 'graphql', 'websocket', 'oauth', 'jwt', 'ci/cd', 'devops',
  'マイクロサービス', 'サーバーレス', 'sre', 'セキュリティ', 'linux', 'ubuntu',
  'git', 'vim', 'vscode', 'プログラミング', '開発', 'エンジニア', 'コーディング',
  'アルゴリズム', 'データ構造', 'デザインパターン', 'リファクタリング', 'テスト',
  'フロントエンド', 'バックエンド', 'フルスタック', 'web開発', 'アプリ開発',
  'オープンソース', 'oss', 'npm', 'yarn', 'pip', 'gem', 'cargo'
];

function isTechArticle(title: string, summary: string | null, content: string | null): boolean {
  const titleLower = title.toLowerCase();
  const summaryLower = (summary || '').toLowerCase();
  const contentLower = (content || '').toLowerCase().slice(0, 1000);
  
  // 非技術系キーワード（除外対象）
  const nonTechKeywords = [
    '政治', '選挙', '首相', '議員', '国会', '政党',
    '芸能', 'アイドル', 'ドラマ', 'アニメ', '漫画', 'ジャンプ',
    '事件', '事故', '裁判', '警察', '逮捕',
    'スポーツ', '野球', 'サッカー', 'オリンピック',
    '恋愛', '結婚', '離婚', '不倫',
    '料理', 'グルメ', 'ラーメン', '食べ物',
    '旅行', '観光', 'ホテル',
    '健康', '病気', '医療',
    'ファッション', '美容',
    '経済', '株価', '為替', '投資',
    '戦争', '紛争', '軍事',
    '宗教', '思想',
    '文学', '小説', '詩',
    'ニュース', '速報',
    '天気', '気候',
    '教育', '学校', '受験',
    '社会', '福祉', '介護'
  ];
  
  // 非技術系キーワードが含まれていたら除外
  const hasNonTechKeyword = nonTechKeywords.some(keyword => {
    const keywordLower = keyword.toLowerCase();
    return titleLower.includes(keywordLower);
  });
  
  if (hasNonTechKeyword) {
    return false;
  }
  
  // 技術キーワードが含まれているかチェック
  return techKeywords.some(keyword => {
    const keywordLower = keyword.toLowerCase();
    return titleLower.includes(keywordLower) || 
           summaryLower.includes(keywordLower) ||
           contentLower.includes(keywordLower);
  });
}

async function cleanNonTechArticles() {
  console.log('非技術系記事のクリーンアップを開始します...');
  
  // はてなブックマークの記事を取得
  const hatenaSource = await prisma.source.findFirst({
    where: { name: 'はてなブックマーク' }
  });
  
  if (!hatenaSource) {
    console.log('はてなブックマークのソースが見つかりません');
    return;
  }
  
  const articles = await prisma.article.findMany({
    where: { sourceId: hatenaSource.id }
  });
  
  console.log(`はてなブックマークの記事数: ${articles.length}`);
  
  let deletedCount = 0;
  for (const article of articles) {
    if (!isTechArticle(article.title, article.summary, article.content)) {
      await prisma.article.delete({
        where: { id: article.id }
      });
      deletedCount++;
      console.log(`削除: ${article.title}`);
    }
  }
  
  console.log(`\n削除完了: ${deletedCount}件の非技術系記事を削除しました`);
  
  // 残った記事数を確認
  const remainingCount = await prisma.article.count({
    where: { sourceId: hatenaSource.id }
  });
  console.log(`残った記事数: ${remainingCount}件`);
}

cleanNonTechArticles()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });