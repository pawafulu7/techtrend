import { jest } from '@jest/globals';

export const getServerSession = jest.fn().mockResolvedValue({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  }
});

export const NextAuth = jest.fn(() => ({
  handlers: {},
  auth: jest.fn().mockResolvedValue({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User'
    }
  }),
  signIn: jest.fn(),
  signOut: jest.fn()
}));

// Default export for NextAuth
const mockNextAuth = jest.fn(() => ({
  handlers: {},
  auth: jest.fn().mockResolvedValue({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User'
    }
  }),
  signIn: jest.fn(),
  signOut: jest.fn()
}));

export default mockNextAuth;