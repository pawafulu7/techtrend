/**
 * チャット機能の定数定義
 */

import { FixedResponse } from './types';

// 固定応答メッセージのマッピング
export const FIXED_RESPONSES: FixedResponse[] = [
  {
    keywords: ['こんにちは', 'hello', 'hi', 'はじめまして', 'よろしく'],
    response: 'こんにちは！TechTrendのAIアシスタントです。技術記事の検索や、サイトの使い方についてお手伝いできます。何かお探しですか？',
    type: 'greeting',
    actions: ['使い方を教えて', '最新記事を見る', 'React記事を探す']
  },
  {
    keywords: ['使い方', 'help', 'ヘルプ', '教えて', 'どうやって'],
    response: `TechTrendの使い方をご説明します：

📚 **記事検索**: キーワードを入力して技術記事を検索できます
🏷️ **タグ検索**: タグから関連記事を探せます
📊 **トレンド分析**: 人気の技術トピックを確認できます
⭐ **お気に入り**: ログインして記事を保存できます

何について詳しく知りたいですか？`,
    type: 'help',
    actions: ['記事を検索', 'タグ一覧を見る', 'トレンドを見る']
  },
  {
    keywords: ['検索', '探す', 'search', '見つける'],
    response: '記事を検索します。どんな技術やキーワードをお探しですか？例えば「React」「TypeScript」「AI」などを入力してください。',
    type: 'search',
    actions: ['React', 'TypeScript', 'Next.js', 'AI/ML']
  },
  {
    keywords: ['react', 'リアクト'],
    response: 'Reactに関する記事を検索しています...',
    type: 'search',
    actions: ['もっと見る', '他の技術を検索']
  },
  {
    keywords: ['typescript', 'ts', 'タイプスクリプト'],
    response: 'TypeScriptに関する記事を検索しています...',
    type: 'search',
    actions: ['もっと見る', '他の技術を検索']
  },
  {
    keywords: ['next.js', 'nextjs', 'ネクスト'],
    response: 'Next.jsに関する記事を検索しています...',
    type: 'search',
    actions: ['もっと見る', '他の技術を検索']
  },
  {
    keywords: ['rails', 'ruby', 'レイルズ', 'ルビー'],
    response: 'Ruby on Railsに関する記事を検索しています...',
    type: 'search',
    actions: ['もっと見る', '他の技術を検索']
  },
  {
    keywords: ['python', 'パイソン', 'django', 'flask'],
    response: 'Pythonに関する記事を検索しています...',
    type: 'search',
    actions: ['もっと見る', '他の技術を検索']
  },
  {
    keywords: ['機械学習', '人工知能', 'chatgpt', 'claude'],
    response: 'AI/機械学習に関する記事を検索しています...',
    type: 'search',
    actions: ['もっと見る', '他の技術を検索']
  },
  {
    keywords: ['ありがとう', 'thanks', 'thank you', 'サンキュー'],
    response: 'どういたしまして！他にもお手伝いできることがあれば、お気軽にお声がけください。',
    type: 'general',
    actions: ['他の質問をする', 'ヘルプを見る']
  },
  {
    keywords: ['さようなら', 'bye', 'goodbye', 'バイバイ', 'じゃあね'],
    response: 'またのご利用をお待ちしています！良い技術記事探しを！',
    type: 'general',
    actions: ['チャットを閉じる']
  }
];

// デフォルト応答
export const DEFAULT_RESPONSE = {
  response: 'すみません、よく理解できませんでした。もう一度違う言葉でお試しいただくか、「使い方」と入力してヘルプをご覧ください。',
  type: 'general' as const,
  actions: ['使い方を見る', '記事を検索', 'ヘルプ']
};

// チャットウィンドウの設定
export const CHAT_CONFIG = {
  // 位置とサイズ
  position: {
    bottom: '20px',
    right: '20px'
  },
  size: {
    desktop: {
      width: '400px',
      height: '600px'
    },
    mobile: {
      width: '100%',
      height: '100%'
    }
  },
  // アニメーション設定
  animation: {
    duration: 300,
    easing: 'ease-in-out'
  },
  // メッセージ設定
  message: {
    maxLength: 500,
    typingDelay: 1000
  }
};

// 初期メッセージ
export const INITIAL_MESSAGE: string = `こんにちは！👋
TechTrendのAIアシスタントです。

技術記事の検索や、サイトの使い方についてお手伝いできます。
お気軽にご質問ください！`;

// クイックアクション
export const QUICK_ACTIONS = [
  '使い方を教えて',
  'React記事を探す',
  'TypeScript記事を探す',
  'Rails記事を探す',
  '最新記事を見る',
  'トレンドを確認'
];