// Node環境用のセットアップ

// Polyfill for Node.js environment
const { TextEncoder, TextDecoder } = require('util');
const { MessageChannel, MessagePort } = require('worker_threads');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.MessageChannel = MessageChannel;
global.MessagePort = MessagePort;

// Polyfill for streams
const { ReadableStream, WritableStream, TransformStream } = require('web-streams-polyfill');
global.ReadableStream = ReadableStream;
global.WritableStream = WritableStream;
global.TransformStream = TransformStream;

// Setup undici for Next.js App Router API tests
const { Request, Response, Headers, fetch, FormData } = require('undici');
global.Request = Request;
global.Response = Response;
global.Headers = Headers;
global.fetch = fetch;
global.FormData = FormData;

// Mock environment variables
// CI環境とローカル環境で異なるデータベース設定を使用
if (!process.env.DATABASE_URL) {
  if (process.env.CI) {
    // GitHub Actions などのCI環境（ポート5432）
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/techtrend_test';
  } else {
    // ローカル環境（ポート5433）
    process.env.DATABASE_URL = 'postgresql://postgres:postgres_dev_password@localhost:5433/techtrend_test';
  }
}

// Redisポートも環境に応じて設定
if (!process.env.REDIS_PORT) {
  process.env.REDIS_PORT = process.env.CI ? '6379' : '6380';
}

process.env.GEMINI_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';

// Mock Next.js router (if needed in some tests)
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '';
  },
}));

// Mock ioredis
jest.mock('ioredis', () => {
  const RedisMock = jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    ttl: jest.fn().mockResolvedValue(60),
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn(),
    quit: jest.fn(),
  }));
  return RedisMock;
});

// Mock next-auth-like auth helper used in API routes
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
}));
