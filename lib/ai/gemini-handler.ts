import { GeminiClient } from './gemini';
import { detectArticleType } from '../utils/article-type-detector';
import { generatePromptForArticleType } from '../utils/article-type-prompts';

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
}

export async function generateSummaryAndTags(
  title: string,
  content: string
): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const client = new GeminiClient(apiKey);
  
  // 記事タイプを判定
  const articleType = detectArticleType(title, content);
  
  // 簡潔な要約とタグを生成
  const { summary, tags } = await client.generateSummaryWithTags(title, content);
  
  // 詳細な要約を生成（記事タイプに応じたプロンプトを使用）
  const detailedSummary = await client.generateSummary(title, content);
  
  return {
    summary,
    detailedSummary,
    tags,
    articleType
  };
}