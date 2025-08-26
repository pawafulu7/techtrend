import { jest } from '@jest/globals';

export const getServerSession = jest.fn().mockResolvedValue({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  }
});

export const NextAuth = jest.fn();