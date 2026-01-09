import type { Session } from 'next-auth';
import {
  resolveSession,
  createSessionContext,
  extendWithSessionContext,
  type SessionContext,
} from '@/lib/middleware/session-context';

// Mock auth module
jest.mock('@/lib/auth/auth');

import { auth } from '@/lib/auth/auth';

const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('session-context', () => {
  const mockSession: Session = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveSession', () => {
    it('should call auth() when context is undefined', async () => {
      mockAuth.mockResolvedValue(mockSession);

      const result = await resolveSession(undefined);

      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockSession);
    });

    it('should call auth() when context is empty object', async () => {
      mockAuth.mockResolvedValue(mockSession);
      const context: SessionContext = {};

      const result = await resolveSession(context);

      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockSession);
      expect(context.session).toBe(mockSession);
    });

    it('should reuse session from context when already resolved', async () => {
      const context: SessionContext = {
        session: mockSession,
      };

      const result = await resolveSession(context);

      expect(mockAuth).not.toHaveBeenCalled();
      expect(result).toBe(mockSession);
    });

    it('should reuse null session from context', async () => {
      const context: SessionContext = {
        session: null,
      };

      const result = await resolveSession(context);

      expect(mockAuth).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should share sessionPromise to prevent duplicate auth() calls', async () => {
      mockAuth.mockResolvedValue(mockSession);
      const context: SessionContext = {};

      // Call resolveSession multiple times concurrently
      const [result1, result2, result3] = await Promise.all([
        resolveSession(context),
        resolveSession(context),
        resolveSession(context),
      ]);

      // auth() should only be called once
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(result1).toBe(mockSession);
      expect(result2).toBe(mockSession);
      expect(result3).toBe(mockSession);
    });

    it('should cache session after promise resolves', async () => {
      mockAuth.mockResolvedValue(mockSession);
      const context: SessionContext = {};

      // First call - creates promise
      await resolveSession(context);
      expect(context.session).toBe(mockSession);
      expect(context.sessionPromise).toBeDefined();

      // Second call - should use cached session
      mockAuth.mockClear();
      const result2 = await resolveSession(context);

      expect(mockAuth).not.toHaveBeenCalled();
      expect(result2).toBe(mockSession);
    });

    it('should handle auth() returning null', async () => {
      mockAuth.mockResolvedValue(null);
      const context: SessionContext = {};

      const result = await resolveSession(context);

      expect(result).toBeNull();
      expect(context.session).toBeNull();
    });

    it('should propagate auth() errors', async () => {
      const authError = new Error('Auth failed');
      mockAuth.mockRejectedValue(authError);
      const context: SessionContext = {};

      await expect(resolveSession(context)).rejects.toThrow('Auth failed');
    });
  });

  describe('createSessionContext', () => {
    it('should return an empty object', () => {
      const context = createSessionContext();

      expect(context).toEqual({});
      expect(context.session).toBeUndefined();
      expect(context.sessionPromise).toBeUndefined();
    });

    it('should return a new object each time', () => {
      const context1 = createSessionContext();
      const context2 = createSessionContext();

      expect(context1).not.toBe(context2);
    });
  });

  describe('extendWithSessionContext', () => {
    it('should preserve existing params from dynamic routes', () => {
      const originalContext = {
        params: { id: 'article-123' },
      };

      const extended = extendWithSessionContext(originalContext);

      expect(extended.params).toEqual({ id: 'article-123' });
      expect(extended.session).toBeUndefined();
      expect(extended.sessionPromise).toBeUndefined();
    });

    it('should preserve multiple existing properties', () => {
      const originalContext = {
        params: { id: 'article-123', slug: 'test-slug' },
        customProp: 'value',
        nested: { deep: 'object' },
      };

      const extended = extendWithSessionContext(originalContext);

      expect(extended.params).toEqual({ id: 'article-123', slug: 'test-slug' });
      expect(extended.customProp).toBe('value');
      expect(extended.nested).toEqual({ deep: 'object' });
    });

    it('should work with undefined context', () => {
      const extended = extendWithSessionContext(undefined);

      expect(extended).toEqual({});
    });

    it('should work with empty context', () => {
      const extended = extendWithSessionContext({});

      expect(extended).toEqual({});
    });

    it('should create isolated session context for each call', async () => {
      mockAuth.mockResolvedValue(mockSession);

      const context1 = extendWithSessionContext({ requestId: '1' });
      const context2 = extendWithSessionContext({ requestId: '2' });

      // Resolve session for context1 only
      await resolveSession(context1);

      // context2 should not have the session
      expect(context1.session).toBe(mockSession);
      expect(context2.session).toBeUndefined();
    });
  });

  describe('integration: middleware chain simulation', () => {
    it('should share session across middleware chain', async () => {
      mockAuth.mockResolvedValue(mockSession);

      // Simulate middleware chain
      const outerContext = extendWithSessionContext({ params: { id: '123' } });

      // First middleware calls resolveSession
      const session1 = await resolveSession(outerContext);

      // Second middleware calls resolveSession with same context
      const session2 = await resolveSession(outerContext);

      // Third middleware calls resolveSession with same context
      const session3 = await resolveSession(outerContext);

      // auth() should only be called once
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(session1).toBe(mockSession);
      expect(session2).toBe(mockSession);
      expect(session3).toBe(mockSession);

      // params should be preserved
      expect(outerContext.params).toEqual({ id: '123' });
    });

    it('should handle CSRF branch calling auth() then downstream reusing', async () => {
      mockAuth.mockResolvedValue(mockSession);

      // Outer middleware creates context
      const context = extendWithSessionContext({});

      // CSRF validation calls resolveSession (Bearer token case)
      const csrfSession = await resolveSession(context);
      expect(csrfSession).toBe(mockSession);

      // Clear mock to verify no additional calls
      mockAuth.mockClear();

      // Downstream middleware (withUserValidation) reuses session
      const userValidationSession = await resolveSession(context);
      expect(userValidationSession).toBe(mockSession);

      // Downstream middleware (withRateLimit) reuses session
      const rateLimitSession = await resolveSession(context);
      expect(rateLimitSession).toBe(mockSession);

      // No additional auth() calls after CSRF validation
      expect(mockAuth).not.toHaveBeenCalled();
    });
  });
});
