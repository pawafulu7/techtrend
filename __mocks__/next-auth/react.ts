// next-auth/react モック
import { jest } from '@jest/globals';
import React from 'react';

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
export const signIn = jest.fn<Promise<{ ok: boolean; error: undefined; status: number; url: null }>, []>().mockResolvedValue({ 
  ok: true,
  error: undefined,
  status: 200,
  url: null 
});

// signOut モック
export const signOut = jest.fn<Promise<{ url: string }>, []>().mockResolvedValue({ 
  url: '/' 
});

// SessionProvider モック
export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => children;

// getServerSession モック（サーバーサイド用）
export const getServerSession = jest.fn<Promise<null>, []>().mockResolvedValue(null);

// getCsrfToken モック
export const getCsrfToken = jest.fn<Promise<string>, []>().mockResolvedValue('mock-csrf-token');

// getProviders モック
type ProvidersType = {
  google: {
    id: string;
    name: string;
    type: string;
    signinUrl: string;
    callbackUrl: string;
  };
  github: {
    id: string;
    name: string;
    type: string;
    signinUrl: string;
    callbackUrl: string;
  };
};

export const getProviders = jest.fn<Promise<ProvidersType>, []>().mockResolvedValue({
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
});

// getSession モック
export const getSession = jest.fn<Promise<null>, []>().mockResolvedValue(null);