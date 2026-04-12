import type { NextAuthConfig } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import type { Provider } from 'next-auth/providers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getRedisClient } from '@/lib/redis/client';
import { RedisAdapter } from './redis-adapter';
import { env } from '@/lib/config/env';

// Hybrid adapter: Redis for sessions, Prisma for user data
const redis = getRedisClient();
const adapter = {
  ...PrismaAdapter(prisma),
  // Override session methods to use Redis
  ...RedisAdapter(redis),
};

// Build providers array conditionally based on environment variables
const providers: Provider[] = [
  // Email/Password authentication
  CredentialsProvider({
    name: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: {
          email: credentials.email as string,
        },
      });

      // Better Auth stores passwords in Account table, not User table.
      // This config.ts is kept for reference only and is superseded by lib/auth/auth.ts.
      if (!user) {
        return null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userPassword = (user as any).password as string | undefined;
      if (!userPassword) {
        return null;
      }

      const isPasswordValid = await bcrypt.compare(
        credentials.password as string,
        userPassword
      );

      if (!isPasswordValid) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

// OAuth providers - only register if environment variables are set
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    })
  );
}

if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthConfig = {
  adapter: adapter as Adapter,

  providers,

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: '/auth/login',
    signOut: '/auth/logout',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
    newUser: '/profile',
  },

  callbacks: {
    async session({ session, token }) {
      if (session?.user && token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
      }
      return token;
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  events: {
    async signIn({ user: _user, account: _account, profile: _profile }) {},
    async signOut(params) {
      // sessionまたはtokenが含まれる可能性がある
      const _session = 'session' in params ? params.session : null;
      const _token = 'token' in params ? params.token : null;
    },
    async createUser({ user: _user }) {},
    async updateUser({ user: _user }) {},
    async linkAccount({ user: _user, account: _account }) {},
  },

  debug: process.env.NODE_ENV === 'development',
};
