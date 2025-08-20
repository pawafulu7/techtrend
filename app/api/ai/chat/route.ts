import { NextRequest, NextResponse } from 'next/server';
import { ChatRequest, ChatResponse } from '@/lib/chat/types';
import { getFixedResponse, extractSearchKeywords, isSearchQuery } from '@/lib/chat/utils';
import { prisma } from '@/lib/database';
import { handleChatMessage, formatSearchResults } from '@/lib/ai/chat-handler';

/**
 * チャットAPIエンドポイント
 * POST /api/ai/chat
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, context, sessionId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Gemini APIが利用可能な場合は高度な処理を試みる
    const useAI = process.env.GEMINI_API_KEY ? true : false;
    
    // chat-handlerで処理
    const handlerResponse = await handleChatMessage({
      message,
      context,
      sessionId,
      useAI
    });

    // 検索が必要な場合
    if (handlerResponse.shouldSearch && handlerResponse.searchKeywords) {
      try {
        // 記事を検索
        const articles = await prisma.article.findMany({
          where: {
            OR: handlerResponse.searchKeywords.map(keyword => ({
              OR: [
                { title: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } }
              ]
            }))
          },
          select: {
            id: true,
            title: true,
            url: true,
            summary: true,
            publishedAt: true,
            sourceType: true,
            source: {
              select: {
                name: true
              }
            },
            tags: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            publishedAt: 'desc'
          },
          take: 5
        });

        const formattedResponse = formatSearchResults(articles, handlerResponse.searchKeywords);
        
        const response: ChatResponse = {
          response: formattedResponse,
          articles: articles.map(article => ({
            ...article,
            publishedAt: article.publishedAt,
            source: article.source ? { name: article.source.name } : undefined,
            tags: article.tags.map(tag => ({ name: tag.name }))
          })),
          suggestedActions: articles.length > 0 
            ? ['もっと見る', '他のキーワードで検索', '絞り込み']
            : ['他のキーワードで検索', '人気の記事を見る', 'ヘルプ'],
          type: 'articles'
        };

        return NextResponse.json(response);
      } catch (error) {
        console.error('Database error:', error);
        // データベースエラーの場合はエラーメッセージを返す
        const response: ChatResponse = {
          response: 'データベースエラーが発生しました。しばらくしてからもう一度お試しください。',
          suggestedActions: ['もう一度試す', 'ヘルプを見る'],
          type: 'text'
        };
        return NextResponse.json(response);
      }
    }

    // 通常の応答を返す
    const response: ChatResponse = {
      response: handlerResponse.response,
      suggestedActions: handlerResponse.suggestedActions,
      type: 'text'
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        response: 'エラーが発生しました。しばらくしてからもう一度お試しください。',
        type: 'error' as const
      },
      { status: 500 }
    );
  }
}

/**
 * チャットAPIの情報を取得
 * GET /api/ai/chat
 */
export async function GET() {
  const hasGeminiAPI = !!process.env.GEMINI_API_KEY;
  
  return NextResponse.json({
    version: '2.0.0',
    capabilities: [
      'fixed_responses',
      'article_search',
      'keyword_extraction',
      hasGeminiAPI ? 'ai_responses' : null
    ].filter(Boolean),
    aiEnabled: hasGeminiAPI,
    status: 'active'
  });
}