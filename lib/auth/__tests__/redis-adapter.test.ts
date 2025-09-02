import Redis from 'ioredis';
import { RedisAdapter } from '../redis-adapter';

jest.mock('ioredis');

describe('RedisAdapter', () => {
  let mockRedis: jest.Mocked<Redis>;
  let adapter: ReturnType<typeof RedisAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      expire: jest.fn(),
    } as unknown as jest.Mocked<Redis>;
    
    adapter = RedisAdapter(mockRedis);
  });

  describe('createUser', () => {
    it('should create a user with email', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: new Date('2024-01-01'),
      };
      
      const result = await adapter.createUser!(userData);
      
      expect(result).toHaveProperty('id');
      expect(result.email).toBe(userData.email);
      expect(result.name).toBe(userData.name);
      expect(result.emailVerified).toEqual(userData.emailVerified);
      
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
      
      // Check user data storage
      const userSetCall = mockRedis.set.mock.calls[0];
      expect(userSetCall[0]).toMatch(/^auth:user:/);
      const storedData = JSON.parse(userSetCall[1] as string);
      expect(storedData.email).toBe(userData.email);
      expect(storedData.emailVerified).toBe(userData.emailVerified.toISOString());
      expect(userSetCall[2]).toBe('EX');
      expect(userSetCall[3]).toBe(30 * 24 * 60 * 60);
      
      // Check email index storage
      const emailSetCall = mockRedis.set.mock.calls[1];
      expect(emailSetCall[0]).toBe(`auth:email:${userData.email}`);
      expect(emailSetCall[1]).toBe(result.id);
    });

    it('should create a user without email', async () => {
      const userData = {
        name: 'Test User',
        emailVerified: null,
      };
      
      const result = await adapter.createUser!(userData);
      
      expect(result).toHaveProperty('id');
      expect(result.name).toBe(userData.name);
      expect(result.emailVerified).toBeNull();
      
      // Should only set user data, not email index
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      
      const userSetCall = mockRedis.set.mock.calls[0];
      expect(userSetCall[0]).toMatch(/^auth:user:/);
    });

    it('should handle users without emailVerified', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
      };
      
      const result = await adapter.createUser!(userData);
      
      expect(result.emailVerified).toBeNull();
      
      const userSetCall = mockRedis.set.mock.calls[0];
      const storedData = JSON.parse(userSetCall[1] as string);
      expect(storedData.emailVerified).toBeNull();
    });
  });

  describe('getUser', () => {
    it('should retrieve an existing user', async () => {
      const userId = 'user-123';
      const userData = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: '2024-01-01T00:00:00.000Z',
      };
      
      mockRedis.get.mockResolvedValue(JSON.stringify(userData));
      
      const result = await adapter.getUser!(userId);
      
      expect(mockRedis.get).toHaveBeenCalledWith(`auth:user:${userId}`);
      expect(result).toEqual({
        ...userData,
        emailVerified: new Date(userData.emailVerified),
      });
    });

    it('should return null for non-existent user', async () => {
      const userId = 'non-existent';
      
      mockRedis.get.mockResolvedValue(null);
      
      const result = await adapter.getUser!(userId);
      
      expect(mockRedis.get).toHaveBeenCalledWith(`auth:user:${userId}`);
      expect(result).toBeNull();
    });

    it('should handle user without emailVerified', async () => {
      const userId = 'user-123';
      const userData = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
      };
      
      mockRedis.get.mockResolvedValue(JSON.stringify(userData));
      
      const result = await adapter.getUser!(userId);
      
      expect(result).toEqual({
        ...userData,
        emailVerified: null,
      });
    });
  });

  describe('getUserByEmail', () => {
    it('should retrieve user by email', async () => {
      const email = 'test@example.com';
      const userId = 'user-123';
      const userData = {
        id: userId,
        email,
        name: 'Test User',
        emailVerified: null,
      };
      
      mockRedis.get
        .mockResolvedValueOnce(userId) // Email index lookup
        .mockResolvedValueOnce(JSON.stringify(userData)); // User data lookup
      
      const result = await adapter.getUserByEmail!(email);
      
      expect(mockRedis.get).toHaveBeenCalledWith(`auth:email:${email}`);
      expect(mockRedis.get).toHaveBeenCalledWith(`auth:user:${userId}`);
      expect(result).toEqual(userData);
    });

    it('should return null if email not found', async () => {
      const email = 'notfound@example.com';
      
      mockRedis.get.mockResolvedValueOnce(null);
      
      const result = await adapter.getUserByEmail!(email);
      
      expect(mockRedis.get).toHaveBeenCalledWith(`auth:email:${email}`);
      expect(mockRedis.get).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    it('should return null if user data not found', async () => {
      const email = 'test@example.com';
      const userId = 'user-123';
      
      mockRedis.get
        .mockResolvedValueOnce(userId) // Email index exists
        .mockResolvedValueOnce(null); // But user data doesn't
      
      const result = await adapter.getUserByEmail!(email);
      
      expect(result).toBeNull();
    });
  });

  describe('createSession', () => {
    it.skip('should create a new session', async () => {
      const sessionData = {
        sessionToken: 'token-123',
        userId: 'user-123',
        expires: new Date('2024-02-01'),
      };
      
      const result = await adapter.createSession!(sessionData);
      
      expect(result).toEqual(sessionData);
      
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
      
      // Check session storage
      const sessionSetCall = mockRedis.set.mock.calls[0];
      expect(sessionSetCall[0]).toBe(`auth:session:${sessionData.sessionToken}`);
      const storedSession = JSON.parse(sessionSetCall[1] as string);
      expect(storedSession.userId).toBe(sessionData.userId);
      expect(storedSession.expires).toBe(sessionData.expires.toISOString());
      
      // Check token index
      const tokenSetCall = mockRedis.set.mock.calls[1];
      expect(tokenSetCall[0]).toBe(`auth:token:${sessionData.sessionToken}`);
      expect(tokenSetCall[1]).toBe(sessionData.userId);
    });
  });

  describe('getSessionAndUser', () => {
    it.skip('should retrieve session and user data', async () => {
      const sessionToken = 'token-123';
      const sessionData = {
        sessionToken,
        userId: 'user-123',
        expires: '2024-02-01T00:00:00.000Z',
      };
      const userData = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
      };
      
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(sessionData)) // Session data
        .mockResolvedValueOnce(JSON.stringify(userData)); // User data
      
      const result = await adapter.getSessionAndUser!(sessionToken);
      
      expect(mockRedis.get).toHaveBeenCalledWith(`auth:session:${sessionToken}`);
      expect(mockRedis.get).toHaveBeenCalledWith(`auth:user:${sessionData.userId}`);
      
      expect(result).toEqual({
        session: {
          ...sessionData,
          expires: new Date(sessionData.expires),
        },
        user: userData,
      });
    });

    it('should return null if session not found', async () => {
      const sessionToken = 'invalid-token';
      
      mockRedis.get.mockResolvedValueOnce(null);
      
      const result = await adapter.getSessionAndUser!(sessionToken);
      
      expect(result).toBeNull();
    });

    it('should return null if user not found', async () => {
      const sessionToken = 'token-123';
      const sessionData = {
        sessionToken,
        userId: 'user-123',
        expires: '2024-02-01T00:00:00.000Z',
      };
      
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(sessionData)) // Session exists
        .mockResolvedValueOnce(null); // But user doesn't
      
      const result = await adapter.getSessionAndUser!(sessionToken);
      
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it.skip('should delete a session', async () => {
      const sessionToken = 'token-123';
      
      await adapter.deleteSession!(sessionToken);
      
      expect(mockRedis.del).toHaveBeenCalledWith(`auth:session:${sessionToken}`);
      expect(mockRedis.del).toHaveBeenCalledWith(`auth:token:${sessionToken}`);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });
  });
});