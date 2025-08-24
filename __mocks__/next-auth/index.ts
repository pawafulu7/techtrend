// next-auth コアモック
import { jest } from '@jest/globals';

// Mock types
type MockAuth = () => {
  auth: jest.Mock;
  signIn: jest.Mock;
  signOut: jest.Mock;
  handlers: {
    GET: jest.Mock;
    POST: jest.Mock;
  };
};

// NextAuth メインエクスポート
const mockNextAuth: MockAuth = jest.fn(() => ({
  auth: jest.fn(() => Promise.resolve(null)),
  signIn: jest.fn(() => Promise.resolve({ success: true })),
  signOut: jest.fn(() => Promise.resolve({ success: true })),
  handlers: {
    GET: jest.fn(),
    POST: jest.fn(),
  },
})) as unknown as MockAuth;

export default mockNextAuth;

// NextAuthOptions タイプ
export interface NextAuthOptions {
  providers?: any[];
  callbacks?: any;
  pages?: any;
  session?: any;
  jwt?: any;
  secret?: string;
  adapter?: any;
  debug?: boolean;
}

// AuthOptions エクスポート
export const AuthOptions: NextAuthOptions = {
  providers: [],
  callbacks: {},
  pages: {},
  session: { strategy: 'jwt' },
  jwt: {},
  secret: 'test-secret',
  debug: false,
};

// getServerSession モック
export const getServerSession = jest.fn(() => Promise.resolve(null));

// JWT関連
export const encode = jest.fn(() => Promise.resolve('mock-jwt-token'));
export const decode = jest.fn(() => Promise.resolve({ 
  sub: 'user-id',
  email: 'test@example.com' 
}));

// アダプター関連のモック
export const PrismaAdapter = jest.fn(() => ({
  createUser: jest.fn(),
  getUser: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserByAccount: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  linkAccount: jest.fn(),
  unlinkAccount: jest.fn(),
  createSession: jest.fn(),
  getSessionAndUser: jest.fn(),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
  createVerificationToken: jest.fn(),
  useVerificationToken: jest.fn(),
}));