// Integration test setup

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

// Do not override DATABASE_URL here — server uses its own env
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-api-key';
process.env.NODE_ENV = 'test';

// Mock next/navigation only if needed
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

// Mock next-auth-like auth helper used in API routes
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

