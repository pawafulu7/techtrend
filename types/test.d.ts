/**
 * Test-specific type definitions
 */

import { Article, Source, Tag } from '@prisma/client';

// Test article data with relations
export interface TestArticle extends Article {
  source?: Source;
  tags?: Tag[];
  _count?: {
    readingList?: number;
  };
}

// Mock Prisma client type
export interface MockPrismaClient {
  article: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  source: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
  };
  tag: {
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
  $disconnect: jest.Mock;
}

// API test response types
export interface TestApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TestPaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Test helper types
export interface MockRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
}

export interface MockResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
}