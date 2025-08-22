// next-auth コアモック
import { jest } from '@jest/globals';

// NextAuth メインエクスポート
export default jest.fn(() => ({
  auth: jest.fn().mockResolvedValue(null),
  signIn: jest.fn().mockResolvedValue({ success: true }),
  signOut: jest.fn().mockResolvedValue({ success: true }),
  handlers: {
    GET: jest.fn(),
    POST: jest.fn(),
  },
}));

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
export const getServerSession = jest.fn().mockResolvedValue(null);

// JWT関連
export const encode = jest.fn().mockResolvedValue('mock-jwt-token');
export const decode = jest.fn().mockResolvedValue({ 
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