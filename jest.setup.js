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
process.env.DATABASE_URL = 'file:./prisma/test.db';
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