// next-auth/react モック
import { jest } from '@jest/globals';

export interface Session {
  user?: {
    id?: string;
    email?: string;
    name?: string;
    image?: string;
  };
  expires?: string;
}

export interface SessionContextValue {
  data: Session | null;
  status: 'authenticated' | 'unauthenticated' | 'loading';
  update: jest.Mock;
}

// useSession モック
export const useSession = jest.fn<() => SessionContextValue>(() => ({
  data: null,
  status: 'unauthenticated',
  update: jest.fn(),
}));

// signIn モック
export const signIn = jest.fn().mockResolvedValue({ 
  ok: true,
  error: undefined,
  status: 200,
  url: null 
}) as jest.Mock;

// signOut モック
export const signOut = jest.fn().mockResolvedValue({ 
  url: '/' 
}) as jest.Mock;

// SessionProvider モック
export const SessionProvider = ({ children }: { children: React.ReactNode }) => children;

// getServerSession モック（サーバーサイド用）
export const getServerSession = jest.fn().mockResolvedValue(null);

// getCsrfToken モック
export const getCsrfToken = jest.fn().mockResolvedValue('mock-csrf-token');

// getProviders モック
export const getProviders = jest.fn().mockResolvedValue({
  google: {
    id: 'google',
    name: 'Google',
    type: 'oauth',
    signinUrl: '/api/auth/signin/google',
    callbackUrl: '/api/auth/callback/google',
  },
  github: {
    id: 'github',
    name: 'GitHub',
    type: 'oauth',
    signinUrl: '/api/auth/signin/github',
    callbackUrl: '/api/auth/callback/github',
  },
}) as jest.Mock;

// getSession モック
export const getSession = jest.fn().mockResolvedValue(null) as jest.Mock;