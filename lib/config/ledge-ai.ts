export const ledgeAiConfig = {
  apiBaseUrl: 'https://public-strapi-v5.api.ledge-ai.the-ai.jp/api/v1/articles',
  articleBaseUrl: 'https://ledge.ai/articles',
  allowedArticleHosts: ['ledge.ai'] as const,
  allowedThumbnailHosts: ['storage.googleapis.com'] as const,
  paginationLimit: 30,
  timeout: 30000,
  retryLimit: 3,
  maxUrlLength: 2048,
  debug: process.env.NODE_ENV === 'development',
};
