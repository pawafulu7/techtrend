/**
 * チャット処理ハンドラー
 * Gemini APIを使用した高度な対話処理
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMessage } from '@/lib/chat/types';
import { extractSearchKeywords } from '@/lib/chat/utils';
import { CHAT_PROMPTS } from './prompts';

// Gemini APIクライアントの初期化
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const model = genAI?.getGenerativeModel({ 
  model: 'gemini-pro',
  generationConfig: {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 500,
  }
});

export interface ChatHandlerOptions {
  message: string;
  context?: ChatMessage[];
  sessionId?: string;
  useAI?: boolean;
}

export interface ChatHandlerResponse {
  response: string;
  searchKeywords?: string[];
  suggestedActions?: string[];
  shouldSearch?: boolean;
  error?: string;
}

/**
 * チャットメッセージを処理
 */
export async function handleChatMessage(
  options: ChatHandlerOptions
): Promise<ChatHandlerResponse> {
  const { message, context = [], useAI = true } = options;

  try {
    // キーワード抽出
    const keywords = extractSearchKeywords(message);
    
    // 検索意図の判定
    const searchIntent = detectSearchIntent(message);
    
    if (searchIntent && keywords.length > 0) {
      // 検索処理
      return {
        response: `${keywords.join(', ')}に関する記事を検索します...`,
        searchKeywords: keywords,
        shouldSearch: true,
        suggestedActions: ['もっと見る', '他のキーワードで検索', '詳細を教えて']
      };
    }

    // Gemini APIが利用可能かつ有効な場合
    if (useAI && model) {
      return await generateAIResponse(message, context);
    }

    // フォールバック: 固定応答
    return {
      response: 'すみません、現在AI機能は利用できません。キーワードを入力して記事を検索してみてください。',
      suggestedActions: ['React記事を探す', 'TypeScript記事を探す', '使い方を見る']
    };

  } catch (error) {
    console.error('Chat handler error:', error);
    return {
      response: 'エラーが発生しました。もう一度お試しください。',
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestedActions: ['もう一度試す', 'ヘルプを見る']
    };
  }
}

/**
 * Gemini APIを使用して応答を生成
 */
async function generateAIResponse(
  message: string,
  context: ChatMessage[]
): Promise<ChatHandlerResponse> {
  if (!model) {
    throw new Error('Gemini API is not configured');
  }

  try {
    // コンテキストを構築
    const conversationHistory = context
      .slice(-5) // 最新5件のみ
      .map(msg => `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${msg.content}`)
      .join('\n');

    // プロンプトを構築
    const prompt = CHAT_PROMPTS.conversation
      .replace('{history}', conversationHistory)
      .replace('{message}', message);

    // Gemini APIを呼び出し
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 応答から提案アクションを抽出
    const suggestedActions = extractSuggestedActions(text);

    return {
      response: text,
      suggestedActions: suggestedActions.length > 0 
        ? suggestedActions 
        : ['他の質問をする', '記事を検索', 'ヘルプ']
    };

  } catch (error) {
    console.error('Gemini API error:', error);
    
    // Rate limit エラーの場合
    if (error instanceof Error && error.message.includes('quota')) {
      return {
        response: 'API制限に達しました。しばらく待ってから再度お試しください。',
        error: 'Rate limit exceeded',
        suggestedActions: ['固定応答モードに切り替え', 'しばらく待つ']
      };
    }

    throw error;
  }
}

/**
 * 検索意図を検出
 */
function detectSearchIntent(message: string): boolean {
  const searchPhrases = [
    '探して', '検索', '教えて', '知りたい', 'について',
    'とは', 'の記事', '関する', 'search', 'find', 'about'
  ];

  const lowerMessage = message.toLowerCase();
  return searchPhrases.some(phrase => lowerMessage.includes(phrase));
}

/**
 * 応答テキストから提案アクションを抽出
 */
function extractSuggestedActions(text: string): string[] {
  const actions: string[] = [];

  // 一般的なアクションパターン
  if (text.includes('検索')) {
    actions.push('記事を検索');
  }
  if (text.includes('React') || text.includes('TypeScript')) {
    actions.push('関連記事を見る');
  }
  if (text.includes('質問')) {
    actions.push('他の質問をする');
  }

  return actions.slice(0, 3); // 最大3つ
}

/**
 * 記事検索結果をフォーマット
 */
export function formatSearchResults(
  articles: any[],
  keywords: string[]
): string {
  if (articles.length === 0) {
    return `申し訳ありません。「${keywords.join(', ')}」に関する記事が見つかりませんでした。\n他のキーワードで検索してみてください。`;
  }

  const header = `「${keywords.join(', ')}」に関する記事を${articles.length}件見つけました:\n\n`;
  
  const articleList = articles
    .slice(0, 3)
    .map((article, index) => {
      const date = new Date(article.publishedAt).toLocaleDateString('ja-JP');
      return `${index + 1}. **${article.title}**\n   ${date} - ${article.sourceType}\n   ${article.summary || ''}`;
    })
    .join('\n\n');

  return header + articleList;
}

/**
 * エラーメッセージを生成
 */
export function generateErrorMessage(error: Error): string {
  if (error.message.includes('network')) {
    return 'ネットワークエラーが発生しました。接続を確認してください。';
  }
  if (error.message.includes('timeout')) {
    return 'タイムアウトしました。もう一度お試しください。';
  }
  if (error.message.includes('rate limit')) {
    return 'リクエスト制限に達しました。しばらく待ってからお試しください。';
  }
  
  return '予期しないエラーが発生しました。もう一度お試しください。';
}