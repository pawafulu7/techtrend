// フェッチャー関連の型定義
import { Source } from '@prisma/client';
export type CreateArticleInput = import('./models').CreateArticleInput;

// フェッチ結果の型
export interface FetchResult {
  articles: CreateArticleInput[];
  errors: Error[];
}

// 基底フェッチャーのインターフェース
export interface IFetcher {
  fetch(): Promise<FetchResult>;
}

// RSS系フェッチャー用の型
export interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  isoDate?: string;
  categories?: string[];
}

// API系フェッチャー用の型
export interface APIFetchOptions {
  endpoint: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  retryCount?: number;
  timeout?: number;
}

// スクレイピング系フェッチャー用の型
export interface ScrapeOptions {
  url: string;
  selector: string;
  attributes?: string[];
  limit?: number;
}

// フェッチャーコンストラクタの型
export type FetcherConstructor = new (source: Source) => IFetcher;

// フェッチャーファクトリーの型
export type FetcherFactory = (sourceName: string) => IFetcher | null;
