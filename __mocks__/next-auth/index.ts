// next-auth コアモック
import { jest } from '@jest/globals';

// Mock types
type MockAuth = () => {
  auth: jest.Mock<Promise<null>, []>;
  signIn: jest.Mock<Promise<{ success: boolean }>, []>;
  signOut: jest.Mock<Promise<{ success: boolean }>, []>;
  handlers: {
    GET: jest.Mock<void, []>;
    POST: jest.Mock<void, []>;
  };
};

// NextAuth メインエクスポート
const mockNextAuth: MockAuth = jest.fn(() => ({
  auth: jest.fn<Promise<null>, []>().mockResolvedValue(null),
  signIn: jest.fn<Promise<{ success: boolean }>, []>().mockResolvedValue({ success: true }),
  signOut: jest.fn<Promise<{ success: boolean }>, []>().mockResolvedValue({ success: true }),
  handlers: {
    GET: jest.fn<void, []>(),
    POST: jest.fn<void, []>(),
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
export const getServerSession = jest.fn<Promise<null>, []>().mockResolvedValue(null);

// JWT関連
export const encode = jest.fn<Promise<string>, []>().mockResolvedValue('mock-jwt-token');
export const decode = jest.fn<Promise<{ sub: string; email: string }>, []>().mockResolvedValue({ 
  sub: 'user-id',
  email: 'test@example.com' 
});

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