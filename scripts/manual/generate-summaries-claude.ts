import { PrismaClient, Article, Source, Tag } from '@prisma/client';
import { ClaudeHandler } from '../lib/ai/claude-handler';
import * as readline from 'readline';

const prisma = new PrismaClient();
const claudeHandler = new ClaudeHandler();

// 対話的インターフェース用のreadline設定
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// プロンプト表示用の関数
function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// 記事の一覧表示
async function displayArticles(articles: Array<Article & { source: Source; tags: Tag[] }>, page: number, pageSize: number) {
  console.error('\n=== 記事一覧 ===');
  console.error(`ページ: ${page} (${pageSize}件ずつ表示)`);
  console.error('---');
  
  articles.forEach((article, index) => {
    const num = (page - 1) * pageSize + index + 1;
    const summary = article.summary ? '✓' : '✗';
    const tags = article.tags && article.tags.length > 0 ? '✓' : '✗';
    console.error(`${num}. [${summary}] [${tags}] [${article.source.name}] ${article.title.substring(0, 60)}...`);
  });
  
  console.error('---');
  console.error('コマンド: [番号] 記事選択 / [n] 次ページ / [p] 前ページ / [q] 終了');
}

// Claude Codeによる要約生成（対話的）
async function generateSummaryInteractive(article: Article & { source: Source; tags: Tag[] }) {
  console.error('\n=== 記事詳細 ===');
  console.error(`タイトル: ${article.title}`);
  console.error(`ソース: ${article.source.name}`);
  console.error(`URL: ${article.url}`);
  console.error(`公開日: ${article.publishedAt}`);
  console.error('---');
  
  const content = article.content || '';
  
  // プロンプトを表示
  const generatedPrompt = claudeHandler.getPromptForArticle(article.title, content);
  console.error('\n=== Claude Code用プロンプト ===');
  console.error(generatedPrompt);
  console.error('=====================================\n');
  
  console.error('上記のプロンプトに基づいて、Claude Codeが要約とタグを生成します。');
  console.error('生成された要約とタグを以下の形式で入力してください：\n');
  console.error('要約: [60-80文字の要約]');
  console.error('詳細要約: [詳細な要約]');
  console.error('タグ: [タグ1, タグ2, タグ3]');
  console.error('\n※ 各項目は改行で区切ってください。入力が終わったら空行を2回入力してください。');
  
  // Claude Codeからの入力を受け取る
  const inputLines: string[] = [];
  let emptyLineCount = 0;
  
  while (true) {
    const line = await askQuestion('> ');
    
    if (line === '') {
      emptyLineCount++;
      if (emptyLineCount >= 2) {
        break;
      }
      inputLines.push(line);
    } else {
      emptyLineCount = 0;
      inputLines.push(line);
    }
  }
  
  const responseText = inputLines.join('\n');
  
  // 入力を解析
  const result = claudeHandler.parseSummaryAndTags(responseText, article.articleType || 'general');
  
  console.error('\n=== 生成結果 ===');
  console.error(`要約: ${result.summary}`);
  console.error(`詳細要約: ${result.detailedSummary}`);
  console.error(`タグ: ${result.tags.join(', ')}`);
  console.error(`記事タイプ: ${result.articleType}`);
  
  const confirm = await askQuestion('\nこの内容で保存しますか？ (y/n): ');
  
  if (confirm.toLowerCase() === 'y') {
    // データベースに保存
    await saveToDatabase(article.id, result);
    console.error('✅ 保存しました');
  } else {
    console.error('❌ キャンセルしました');
  }
}

// データベース保存
async function saveToDatabase(articleId: string, result: any) {
  try {
    // 記事の更新
    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        articleType: result.articleType,
        summaryVersion: 2
      }
    });
    
    // タグの処理
    if (result.tags.length > 0) {
      // 既存のタグを取得または作成
      const tagRecords = await Promise.all(
        result.tags.map(async (tagName: string) => {
          const existingTag = await prisma.tag.findUnique({
            where: { name: tagName }
          });

          if (existingTag) {
            return existingTag;
          }

          return await prisma.tag.create({
            data: { name: tagName }
          });
        })
      );

      // 記事にタグを関連付ける
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
  } catch (error) {
    console.error('保存エラー:', error);
    throw error;
  }
}

// メイン処理
async function main() {
  console.error('🤖 Claude Code要約生成ツール');
  console.error('===========================\n');
  
  try {
    let page = 1;
    const pageSize = 10;
    
    while (true) {
      // 記事を取得
      const articles = await prisma.article.findMany({
        include: { 
          source: true,
          tags: true
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      });
      
      if (articles.length === 0) {
        console.error('記事がありません');
        break;
      }
      
      // 記事一覧を表示
      await displayArticles(articles, page, pageSize);
      
      // ユーザー入力を待つ
      const input = await askQuestion('\n選択: ');
      
      if (input === 'q') {
        console.error('終了します');
        break;
      } else if (input === 'n') {
        page++;
      } else if (input === 'p' && page > 1) {
        page--;
      } else {
        const num = parseInt(input);
        if (!isNaN(num) && num >= 1 && num <= articles.length) {
          const article = articles[num - 1];
          await generateSummaryInteractive(article);
        } else {
          console.error('無効な入力です');
        }
      }
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// スクリプトの実行
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}