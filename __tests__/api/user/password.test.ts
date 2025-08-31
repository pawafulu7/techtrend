import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock auth
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn()
}));

// Mock changePassword
jest.mock('@/lib/auth/utils', () => ({
  changePassword: jest.fn()
}));

// Import POST after mocks are set up
const { POST } = require('@/app/api/user/password/route');

describe('/api/user/password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when passwords do not match', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'DifferentPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details.confirmPassword).toContain("Passwords don't match");
    });

    it('should return 400 when new password does not meet requirements', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'short',
          confirmPassword: 'short',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details.newPassword).toBeDefined();
    });

    it('should return 400 when current password is incorrect', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });
      
      (changePassword as jest.Mock).mockRejectedValue(
        new Error('Invalid current password')
      );

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'wrongPassword',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Current password is incorrect');
    });

    it('should successfully change password when all inputs are valid', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });
      
      (changePassword as jest.Mock).mockResolvedValue(true);

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Password changed successfully');
      expect(changePassword).toHaveBeenCalledWith(
        'user123',
        'oldPassword123',
        'NewPassword123'
      );
    });

    it('should return 404 when user is not found', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });
      
      (changePassword as jest.Mock).mockRejectedValue(
        new Error('User not found')
      );

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should return 500 when an unexpected error occurs', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });
      
      (changePassword as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle missing request body gracefully', async () => {
      const { auth } = require('@/lib/auth/auth');
      
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details.currentPassword).toBeDefined();
      expect(data.details.newPassword).toBeDefined();
      expect(data.details.confirmPassword).toBeDefined();
    });
  });
});