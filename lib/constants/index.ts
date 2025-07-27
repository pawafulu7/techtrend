export const SITE_NAME = 'TechTrend';
export const SITE_DESCRIPTION = '最新テックトレンドを一括収集・表示';

export const ARTICLES_PER_PAGE = 20;
export const MAX_SUMMARY_LENGTH = 200;

export const GEMINI_API = {
  MODEL: 'gemini-1.5-flash',
  MAX_TOKENS: 200,
  TEMPERATURE: 0.7,
} as const;

export const FETCH_INTERVALS = {
  HATENA: 15 * 60 * 1000, // 15 minutes
  QIITA: 10 * 60 * 1000,  // 10 minutes
  ZENN: 20 * 60 * 1000,   // 20 minutes
} as const;