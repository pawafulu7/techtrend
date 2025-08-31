import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
// Use Nodemailer if Gmail is configured, otherwise use Resend
import { sendVerificationRequest } from './email-provider';
import { sendVerificationRequestNodemailer } from './email-provider-nodemailer';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Ensure secret is picked up in all environments
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  
  providers: [
    // Email provider for magic link authentication
    EmailProvider({
      // Dummy server config for Resend (actual sending is handled by sendVerificationRequest)
      server: {
        host: 'smtp.resend.com',
        port: 465,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY || 'dummy',
        },
      },
      from: process.env.EMAIL_FROM || 'noreply@techtrend.example.com',
      // Use Nodemailer if Gmail is configured
      sendVerificationRequest: process.env.GMAIL_USER 
        ? sendVerificationRequestNodemailer 
        : sendVerificationRequest,
      maxAge: 24 * 60 * 60, // 24 hours
    }),
    
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        loginToken: { label: 'Login Token', type: 'text' }, // 一時トークンでのログイン用
      },
      async authorize(credentials) {
        if (!credentials?.email) {
          return null;
        }

        // 一時トークンでのログイン（メール認証後の自動ログイン用）
        if (credentials.loginToken) {
          // トークンの検証
          const tempToken = await prisma.verificationToken.findFirst({
            where: {
              identifier: `login:${credentials.email}`,
              token: credentials.loginToken,
              expires: {
                gt: new Date(),
              },
            },
          });

          if (!tempToken) {
            return null;
          }

          // ユーザー情報取得
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user || !user.emailVerified) {
            return null;
          }

          // 使用済みトークンを削除
          await prisma.verificationToken.delete({
            where: {
              identifier_token: {
                identifier: `login:${credentials.email}`,
                token: credentials.loginToken as string,
              },
            },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        }

        // 通常のパスワードログイン
        if (!credentials.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
          },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
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

    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    ] : []),

    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET ? [
      GitHubProvider({
        clientId: process.env.GITHUB_ID,
        clientSecret: process.env.GITHUB_SECRET,
      })
    ] : []),
  ],

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
  },

  debug: process.env.NODE_ENV === 'development',
});
