import { jest } from '@jest/globals';

// Mock session type
export interface MockSession {
  user?: {
    id: string;
    email: string;
    name?: string;
  } | null;
  expires?: string;
}

// Default mock session factory to avoid time-dependent issues
const createDefaultMockSession = (): MockSession => ({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
});

// Mock auth function with fresh session each call
export const auth = jest.fn<() => Promise<MockSession | null>>()
  .mockImplementation(() => Promise.resolve(createDefaultMockSession()));

// Helper function to set custom session
export const setMockSession = (session: MockSession | null) => {
  auth.mockResolvedValue(session);
};

// Helper function to simulate unauthenticated state
export const setUnauthenticated = () => {
  auth.mockResolvedValue(null);
};

// Helper function to reset to default session
export const resetMockSession = () => {
  auth.mockImplementation(() => Promise.resolve(createDefaultMockSession()));
};

// Export mock for signIn and signOut
export const signIn = jest.fn().mockResolvedValue({ success: true });
export const signOut = jest.fn().mockResolvedValue({ success: true });