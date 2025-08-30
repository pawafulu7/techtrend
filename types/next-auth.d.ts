import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      createdAt?: string;
      role?: string;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    createdAt?: string;
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    createdAt?: string;
    role?: string;
  }
}