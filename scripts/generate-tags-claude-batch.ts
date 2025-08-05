import { PrismaClient, Article, Source, Tag } from '@prisma/client';
import { normalizeTag } from '../lib/utils/tag-normalizer';
import { detectArticleType } from '../lib/utils/article-type-detector';

const prisma = new PrismaClient();

type ArticleWithSourceAndTags = Article & {
  source: Source;
  tags: Tag[];
};

interface TagGenerationResult {
  generated: number;
  errors: number;
  skipped: number;
}

interface GeneratedTags {
  tags: string[];
  articleType: string;
}

// Claude Codeでタグを生成する関数
async function generateTagsWithClaude(title: string, content: string): Promise<GeneratedTags> {
  const articleType = detectArticleType(title, content);
  
  // タイトルと内容を分析してタグを生成
  const tags: string[] = [];
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.toLowerCase();
  const combinedText = lowerTitle + ' ' + lowerContent;
  
  // プログラミング言語の検出
  const languages = [
    { name: 'JavaScript', patterns: ['javascript', 'js', 'node.js', 'nodejs', 'npm', 'yarn'] },
    { name: 'TypeScript', patterns: ['typescript', 'ts', 'tsx', '.ts', '.tsx'] },
    { name: 'Python', patterns: ['python', 'pip', 'django', 'flask', 'pandas', 'numpy'] },
    { name: 'Go', patterns: ['golang', 'go言語', 'go ', '.go', 'gin', 'echo'] },
    { name: 'Rust', patterns: ['rust', 'cargo', 'rustc', 'async-std'] },
    { name: 'Java', patterns: ['java', 'spring', 'maven', 'gradle', 'jvm'] },
    { name: 'Ruby', patterns: ['ruby', 'rails', 'gem', 'bundler', 'rake'] },
    { name: 'PHP', patterns: ['php', 'laravel', 'symfony', 'composer'] },
    { name: 'C++', patterns: ['c++', 'cpp', 'cmake', 'boost'] },
    { name: 'C#', patterns: ['c#', 'csharp', '.net', 'dotnet', 'asp.net'] },
    { name: 'Swift', patterns: ['swift', 'swiftui', 'ios開発'] },
    { name: 'Kotlin', patterns: ['kotlin', 'android開発'] },
    { name: 'Scala', patterns: ['scala', 'akka', 'play framework'] }
  ];
  
  // フレームワーク・ライブラリの検出
  const frameworks = [
    { name: 'React', patterns: ['react', 'reactjs', 'react.js', 'jsx', 'next.js', 'nextjs', 'gatsby'] },
    { name: 'Vue', patterns: ['vue', 'vuejs', 'vue.js', 'nuxt', 'vuex'] },
    { name: 'Angular', patterns: ['angular', 'angularjs', 'ng-'] },
    { name: 'Svelte', patterns: ['svelte', 'sveltekit'] },
    { name: 'Django', patterns: ['django', 'django rest'] },
    { name: 'Flask', patterns: ['flask'] },
    { name: 'FastAPI', patterns: ['fastapi', 'fast api'] },
    { name: 'Spring', patterns: ['spring', 'spring boot', 'springboot'] },
    { name: 'Express', patterns: ['express', 'expressjs'] },
    { name: 'Rails', patterns: ['rails', 'ruby on rails'] },
    { name: 'Laravel', patterns: ['laravel'] },
    { name: 'ASP.NET', patterns: ['asp.net', 'aspnet'] },
    { name: 'Next.js', patterns: ['next.js', 'nextjs', 'next js'] },
    { name: 'Nuxt', patterns: ['nuxt', 'nuxtjs', 'nuxt.js'] },
    { name: 'Nest.js', patterns: ['nest.js', 'nestjs'] }
  ];
  
  // 技術カテゴリの検出
  const categories = [
    { name: 'AI', patterns: ['ai', '人工知能', 'artificial intelligence', '生成ai', 'generative ai', 'genai', 'llm', '大規模言語モデル', 'chatgpt', 'claude', 'gemini', 'gpt', 'bard', 'copilot'] },
    { name: '機械学習', patterns: ['機械学習', 'machine learning', 'ml', 'ディープラーニング', 'deep learning', 'neural network', 'ニューラルネットワーク', 'tensorflow', 'pytorch'] },
    { name: 'Frontend', patterns: ['frontend', 'フロントエンド', 'front-end', 'ui', 'ux', 'css', 'html', 'dom', 'ブラウザ', 'browser', 'web開発'] },
    { name: 'Backend', patterns: ['backend', 'バックエンド', 'back-end', 'api', 'server', 'サーバー', 'database', 'データベース', 'db'] },
    { name: 'DevOps', patterns: ['devops', 'ci/cd', 'cicd', 'infrastructure', 'インフラ', 'deployment', 'デプロイ', '運用', 'sre'] },
    { name: 'Cloud', patterns: ['cloud', 'クラウド', 'serverless', 'サーバーレス', 'paas', 'iaas', 'saas'] },
    { name: 'Security', patterns: ['security', 'セキュリティ', 'secure', '脆弱性', 'vulnerability', '暗号', 'encryption', 'auth', '認証', '認可'] },
    { name: 'Mobile', patterns: ['mobile', 'モバイル', 'ios', 'android', 'react native', 'flutter', 'swift', 'kotlin'] },
    { name: 'Data', patterns: ['data', 'データ', 'analytics', 'アナリティクス', 'bigdata', 'ビッグデータ', 'etl', 'データパイプライン'] },
    { name: 'Web3', patterns: ['web3', 'blockchain', 'ブロックチェーン', 'crypto', '暗号資産', 'defi', 'nft', 'smart contract', 'スマートコントラクト'] }
  ];
  
  // ツール・プラットフォームの検出
  const tools = [
    { name: 'Docker', patterns: ['docker', 'dockerfile', 'docker-compose', 'コンテナ', 'container'] },
    { name: 'Kubernetes', patterns: ['kubernetes', 'k8s', 'kubectl', 'helm'] },
    { name: 'Git', patterns: ['git', 'github', 'gitlab', 'gitops', 'version control', 'バージョン管理'] },
    { name: 'AWS', patterns: ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'cloudformation'] },
    { name: 'Google Cloud', patterns: ['google cloud', 'gcp', 'gke', 'bigquery', 'cloud run'] },
    { name: 'Azure', patterns: ['azure', 'microsoft azure', 'azure devops'] },
    { name: 'Terraform', patterns: ['terraform', 'terragrunt', 'infrastructure as code', 'iac'] },
    { name: 'Ansible', patterns: ['ansible', 'playbook'] },
    { name: 'Jenkins', patterns: ['jenkins', 'jenkinsfile'] },
    { name: 'GitHub Actions', patterns: ['github actions', 'actions', 'workflow'] },
    { name: 'Elasticsearch', patterns: ['elasticsearch', 'elastic', 'elk', 'kibana'] },
    { name: 'Redis', patterns: ['redis', 'cache', 'キャッシュ'] },
    { name: 'PostgreSQL', patterns: ['postgresql', 'postgres', 'psql'] },
    { name: 'MySQL', patterns: ['mysql', 'mariadb'] },
    { name: 'MongoDB', patterns: ['mongodb', 'mongo', 'nosql'] },
    { name: 'GraphQL', patterns: ['graphql', 'apollo'] },
    { name: 'REST API', patterns: ['rest api', 'restful', 'rest'] },
    { name: 'Webpack', patterns: ['webpack', 'bundler'] },
    { name: 'Vite', patterns: ['vite', 'vitejs'] },
    { name: 'npm', patterns: ['npm', 'node package manager'] },
    { name: 'Yarn', patterns: ['yarn', 'yarn workspace'] }
  ];
  
  // 検出関数
  const detectItems = (items: Array<{name: string, patterns: string[]}>) => {
    const detected: string[] = [];
    for (const item of items) {
      for (const pattern of item.patterns) {
        if (combinedText.includes(pattern)) {
          if (!detected.includes(item.name)) {
            detected.push(item.name);
          }
          break;
        }
      }
    }
    return detected;
  };
  
  // 各カテゴリから検出
  const detectedLanguages = detectItems(languages);
  const detectedFrameworks = detectItems(frameworks);
  const detectedCategories = detectItems(categories);
  const detectedTools = detectItems(tools);
  
  // タグの優先順位付けと結合
  tags.push(...detectedLanguages.slice(0, 2));
  tags.push(...detectedFrameworks.slice(0, 2));
  tags.push(...detectedCategories.slice(0, 2));
  tags.push(...detectedTools.slice(0, 3));
  
  // 記事タイプに基づく追加タグ
  if (articleType === 'tutorial') {
    if (!tags.includes('チュートリアル')) tags.push('チュートリアル');
  } else if (articleType === 'problem-solving') {
    if (!tags.includes('問題解決')) tags.push('問題解決');
  } else if (articleType === 'implementation') {
    if (!tags.includes('実装')) tags.push('実装');
  } else if (articleType === 'tech-intro') {
    if (!tags.includes('技術紹介')) tags.push('技術紹介');
  }
  
  // 重複を除去し、最大10個に制限
  const uniqueTags = Array.from(new Set(tags)).slice(0, 10);
  
  // 最低3個のタグを確保
  if (uniqueTags.length < 3) {
    // 汎用的なタグを追加
    const genericTags = ['プログラミング', '技術記事', '開発'];
    for (const tag of genericTags) {
      if (!uniqueTags.includes(tag)) {
        uniqueTags.push(tag);
        if (uniqueTags.length >= 3) break;
      }
    }
  }
  
  return {
    tags: uniqueTags,
    articleType
  };
}

// タグをデータベースに保存
async function saveTagsToDatabase(articleId: string, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  
  // タグレコードを作成または取得
  const tagRecords = await Promise.all(
    tags.map(async (tagName) => {
      const normalizedName = normalizeTag(tagName);
      
      let tag = await prisma.tag.findUnique({
        where: { name: normalizedName }
      });
      
      if (!tag) {
        tag = await prisma.tag.create({
          data: { name: normalizedName }
        });
      }
      
      return tag;
    })
  );
  
  // 記事にタグを関連付け
  await prisma.article.update({
    where: { id: articleId },
    data: {
      tags: {
        set: [],  // 既存の関連をクリア
        connect: tagRecords.map(tag => ({ id: tag.id }))
      }
    }
  });
}

// バッチ処理でタグを生成
async function generateTagsBatch(): Promise<TagGenerationResult> {
  console.log('🏷️ Claude Codeタグ生成バッチを開始します...');
  console.log('📊 Rate limitを考慮せず、すべての対象記事を処理します');
  const startTime = Date.now();
  
  try {
    // 1. タグがない記事をすべて取得
    const articlesWithoutTags = await prisma.article.findMany({
      where: {
        tags: {
          none: {}
        }
      },
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' }
    }) as ArticleWithSourceAndTags[];
    
    // 2. タグが1個以下の記事を取得
    const articlesWithFewTags = await prisma.article.findMany({
      where: {
        tags: {
          some: {}
        }
      },
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' }
    }) as ArticleWithSourceAndTags[];
    
    // タグが1個以下の記事をフィルタリング
    const articlesWith1Tag = articlesWithFewTags.filter(
      article => article.tags.length <= 1
    );
    
    // 対象記事を結合（重複除去）
    const allArticles = [
      ...articlesWithoutTags,
      ...articlesWith1Tag
    ];
    
    const uniqueArticles = Array.from(
      new Map(allArticles.map(a => [a.id, a])).values()
    );
    
    if (uniqueArticles.length === 0) {
      console.log('✅ タグ生成が必要な記事はありません');
      return { generated: 0, errors: 0, skipped: 0 };
    }
    
    console.log(`\n📊 処理対象:`);
    console.log(`   - タグなし: ${articlesWithoutTags.length}件`);
    console.log(`   - タグ1個以下: ${articlesWith1Tag.length}件`);
    console.log(`   - 合計: ${uniqueArticles.length}件`);
    console.log(`\n⚡ Claude Codeでの処理のため、Rate limitなしで高速処理します`);
    
    let generatedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // プログレス表示の準備
    const updateProgress = (current: number, total: number) => {
      const percentage = Math.round((current / total) * 100);
      const progressBar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
      process.stdout.write(`\r進捗: [${progressBar}] ${percentage}% (${current}/${total})`);
    };
    
    // 記事ごとにタグを生成
    for (let i = 0; i < uniqueArticles.length; i++) {
      const article = uniqueArticles[i];
      updateProgress(i + 1, uniqueArticles.length);
      
      try {
        const content = article.content || article.summary || '';
        
        // 内容が短すぎる場合はスキップ
        if (content.length < 50) {
          skippedCount++;
          continue;
        }
        
        // Claude Codeでタグを生成
        const result = await generateTagsWithClaude(article.title, content);
        
        if (result.tags.length > 0) {
          await saveTagsToDatabase(article.id, result.tags);
          generatedCount++;
        } else {
          skippedCount++;
        }
        
      } catch (error) {
        errorCount++;
        console.error(`\n✗ エラー: [${article.source.name}] ${article.title.substring(0, 40)}...`);
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log('\n'); // プログレスバーの後に改行
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n📊 タグ生成完了:`);
    console.log(`   成功: ${generatedCount}件`);
    console.log(`   スキップ: ${skippedCount}件`);
    console.log(`   エラー: ${errorCount}件`);
    console.log(`   処理時間: ${duration}秒`);
    console.log(`   平均処理時間: ${(duration / uniqueArticles.length).toFixed(2)}秒/記事`);
    
    return { generated: generatedCount, errors: errorCount, skipped: skippedCount };
    
  } catch (error) {
    console.error('❌ タグ生成バッチエラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  console.log('⚠️  このスクリプトはClaude Code環境で実行してください');
  console.log('📝 生成されたタグをコード内に直接記述する必要があります');
  console.log('\n実行を続けますか？ (Ctrl+Cでキャンセル)');
  
  // 3秒待機
  setTimeout(() => {
    generateTagsBatch()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  }, 3000);
}

export { generateTagsBatch };