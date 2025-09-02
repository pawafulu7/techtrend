import bcrypt from 'bcryptjs';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs');

import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, createUser } from '../utils';

describe('Auth Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password with correct salt rounds', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'hashedPassword123';
      
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      
      const result = await hashPassword(password);
      
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });

    it('should handle bcrypt errors', async () => {
      const password = 'testPassword123';
      
      (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('Hashing failed'));
      
      await expect(hashPassword(password)).rejects.toThrow('Hashing failed');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'hashedPassword123';
      
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      
      const result = await verifyPassword(password, hashedPassword);
      
      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'wrongPassword';
      const hashedPassword = 'hashedPassword123';
      
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      
      const result = await verifyPassword(password, hashedPassword);
      
      expect(result).toBe(false);
    });

    it('should handle bcrypt errors', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'hashedPassword123';
      
      (bcrypt.compare as jest.Mock).mockRejectedValue(new Error('Comparison failed'));
      
      await expect(verifyPassword(password, hashedPassword)).rejects.toThrow('Comparison failed');
    });
  });

  describe.skip('createUser', () => {
    const mockUserData = {
      email: 'test@example.com',
      password: 'testPassword123',
      name: 'Test User',
    };

    it('should create a new user successfully', async () => {
      const hashedPassword = 'hashedPassword123';
      const createdUser = {
        id: 'user-123',
        email: mockUserData.email,
        password: hashedPassword,
        name: mockUserData.name,
      };
      
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (prisma.user.create as jest.Mock).mockResolvedValue(createdUser);
      
      const result = await createUser(mockUserData);
      
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: mockUserData.email },
      });
      
      expect(bcrypt.hash).toHaveBeenCalledWith(mockUserData.password, 12);
      
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: mockUserData.email,
          password: hashedPassword,
          name: mockUserData.name,
        },
      });
      
      expect(result).toEqual(createdUser);
    });

    it('should create user without name', async () => {
      const userDataWithoutName = {
        email: 'test@example.com',
        password: 'testPassword123',
      };
      const hashedPassword = 'hashedPassword123';
      const createdUser = {
        id: 'user-123',
        email: userDataWithoutName.email,
        password: hashedPassword,
        name: undefined,
      };
      
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (prisma.user.create as jest.Mock).mockResolvedValue(createdUser);
      
      const result = await createUser(userDataWithoutName);
      
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userDataWithoutName.email,
          password: hashedPassword,
          name: undefined,
        },
      });
      
      expect(result).toEqual(createdUser);
    });

    it('should throw error if user already exists', async () => {
      const existingUser = {
        id: 'existing-user',
        email: mockUserData.email,
        password: 'existingHash',
        name: 'Existing User',
      };
      
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);
      
      await expect(createUser(mockUserData)).rejects.toThrow('User already exists');
      
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during user creation', async () => {
      const hashedPassword = 'hashedPassword123';
      
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (prisma.user.create as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      await expect(createUser(mockUserData)).rejects.toThrow('Database error');
    });

    it('should handle hashing errors', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('Hashing failed'));
      
      await expect(createUser(mockUserData)).rejects.toThrow('Hashing failed');
      
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});