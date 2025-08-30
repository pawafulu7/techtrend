import { Adapter, AdapterSession, AdapterUser } from 'next-auth/adapters';
import Redis from 'ioredis';

// Redis key prefixes
const KEY_PREFIX = 'auth:';
const USER_PREFIX = `${KEY_PREFIX}user:`;
const SESSION_PREFIX = `${KEY_PREFIX}session:`;
const USER_BY_EMAIL_PREFIX = `${KEY_PREFIX}email:`;
const SESSION_BY_TOKEN_PREFIX = `${KEY_PREFIX}token:`;

// Session TTL (30 days in seconds)
const SESSION_TTL = 30 * 24 * 60 * 60;

export function RedisAdapter(client: Redis): Adapter {
  return {
    async createUser(user) {
      const id = crypto.randomUUID();
      const userData = {
        ...user,
        id,
        emailVerified: user.emailVerified?.toISOString() || null,
      };
      
      await client.set(
        `${USER_PREFIX}${id}`,
        JSON.stringify(userData),
        'EX',
        SESSION_TTL
      );
      
      if (user.email) {
        await client.set(
          `${USER_BY_EMAIL_PREFIX}${user.email}`,
          id,
          'EX',
          SESSION_TTL
        );
      }
      
      return {
        ...userData,
        emailVerified: userData.emailVerified ? new Date(userData.emailVerified) : null,
      };
    },

    async getUser(id) {
      const data = await client.get(`${USER_PREFIX}${id}`);
      if (!data) return null;
      
      const user = JSON.parse(data);
      return {
        ...user,
        emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
      };
    },

    async getUserByEmail(email) {
      const userId = await client.get(`${USER_BY_EMAIL_PREFIX}${email}`);
      if (!userId) return null;
      
      return this.getUser!(userId);
    },

    async getUserByAccount({ provider: _provider, providerAccountId: _providerAccountId }) {
      // For OAuth, we'll use Prisma adapter
      // This is a simplified implementation
      return null;
    },

    async updateUser(user) {
      const existing = await this.getUser!(user.id);
      if (!existing) return null;
      
      const updated = {
        ...existing,
        ...user,
        emailVerified: user.emailVerified?.toISOString() || existing.emailVerified,
      };
      
      await client.set(
        `${USER_PREFIX}${user.id}`,
        JSON.stringify(updated),
        'EX',
        SESSION_TTL
      );
      
      if (user.email && user.email !== existing.email) {
        if (existing.email) {
          await client.del(`${USER_BY_EMAIL_PREFIX}${existing.email}`);
        }
        await client.set(
          `${USER_BY_EMAIL_PREFIX}${user.email}`,
          user.id,
          'EX',
          SESSION_TTL
        );
      }
      
      return {
        ...updated,
        emailVerified: updated.emailVerified ? new Date(updated.emailVerified) : null,
      };
    },

    async deleteUser(userId) {
      const user = await this.getUser!(userId);
      if (!user) return;
      
      await client.del(`${USER_PREFIX}${userId}`);
      if (user.email) {
        await client.del(`${USER_BY_EMAIL_PREFIX}${user.email}`);
      }
    },

    async createSession(session) {
      const id = crypto.randomUUID();
      const sessionData = {
        ...session,
        id,
        expires: session.expires.toISOString(),
      };
      
      await client.set(
        `${SESSION_PREFIX}${id}`,
        JSON.stringify(sessionData),
        'EX',
        SESSION_TTL
      );
      
      await client.set(
        `${SESSION_BY_TOKEN_PREFIX}${session.sessionToken}`,
        id,
        'EX',
        SESSION_TTL
      );
      
      return {
        ...sessionData,
        expires: new Date(sessionData.expires),
      };
    },

    async getSessionAndUser(sessionToken) {
      const sessionId = await client.get(`${SESSION_BY_TOKEN_PREFIX}${sessionToken}`);
      if (!sessionId) return null;
      
      const sessionData = await client.get(`${SESSION_PREFIX}${sessionId}`);
      if (!sessionData) return null;
      
      const session = JSON.parse(sessionData);
      const user = await this.getUser!(session.userId);
      if (!user) return null;
      
      return {
        session: {
          ...session,
          expires: new Date(session.expires),
        },
        user,
      };
    },

    async updateSession(session) {
      const sessionId = await client.get(`${SESSION_BY_TOKEN_PREFIX}${session.sessionToken}`);
      if (!sessionId) return null;
      
      const existing = await client.get(`${SESSION_PREFIX}${sessionId}`);
      if (!existing) return null;
      
      const existingSession = JSON.parse(existing);
      const updated = {
        ...existingSession,
        ...session,
        expires: session.expires?.toISOString() || existingSession.expires,
      };
      
      await client.set(
        `${SESSION_PREFIX}${sessionId}`,
        JSON.stringify(updated),
        'EX',
        SESSION_TTL
      );
      
      return {
        ...updated,
        expires: new Date(updated.expires),
      };
    },

    async deleteSession(sessionToken) {
      const sessionId = await client.get(`${SESSION_BY_TOKEN_PREFIX}${sessionToken}`);
      if (!sessionId) return;
      
      await client.del(`${SESSION_PREFIX}${sessionId}`);
      await client.del(`${SESSION_BY_TOKEN_PREFIX}${sessionToken}`);
    },

    // OAuth methods - using Prisma for these
    async linkAccount(account) {
      // Will be handled by Prisma adapter
      return account as unknown as ReturnType<Adapter['linkAccount']>;
    },

    async unlinkAccount({ provider: _provider, providerAccountId: _providerAccountId }) {
      // Will be handled by Prisma adapter
    },

    // Verification token methods - using Redis
    async createVerificationToken(verificationToken) {
      await client.set(
        `${KEY_PREFIX}vt:${verificationToken.identifier}:${verificationToken.token}`,
        JSON.stringify(verificationToken),
        'EX',
        86400 // 24 hours
      );
      return verificationToken;
    },

    async useVerificationToken({ identifier, token }) {
      const key = `${KEY_PREFIX}vt:${identifier}:${token}`;
      const data = await client.get(key);
      if (!data) return null;
      
      await client.del(key);
      const verificationToken = JSON.parse(data);
      return {
        ...verificationToken,
        expires: new Date(verificationToken.expires),
      };
    },
  };
}