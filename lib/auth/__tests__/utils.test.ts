// Use the manual mock to keep shared state
jest.mock('@/lib/prisma');

// Mock @better-auth/utils/password (scrypt-based)
jest.mock('@better-auth/utils/password', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

import { prisma } from '@/lib/prisma';
import {
  hashPassword,
  verifyPassword,
  createUser,
  changePassword,
} from '../utils';
import {
  hashPassword as baHashPassword,
  verifyPassword as baVerifyPassword,
} from '@better-auth/utils/password';

describe('Auth Utils', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password using scrypt', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'scrypt:hashedPassword123';

      (baHashPassword as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await hashPassword(password);

      expect(baHashPassword).toHaveBeenCalledWith(password);
      expect(result).toBe(hashedPassword);
    });

    it('should handle hashing errors', async () => {
      const password = 'testPassword123';

      (baHashPassword as jest.Mock).mockRejectedValue(
        new Error('Hashing failed')
      );

      await expect(hashPassword(password)).rejects.toThrow('Hashing failed');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'scrypt:hashedPassword123';

      (baVerifyPassword as jest.Mock).mockResolvedValue(true);

      const result = await verifyPassword(password, hashedPassword);

      // utils.ts calls baVerifyPassword(hashedPassword, password)
      expect(baVerifyPassword).toHaveBeenCalledWith(hashedPassword, password);
      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'wrongPassword';
      const hashedPassword = 'scrypt:hashedPassword123';

      (baVerifyPassword as jest.Mock).mockResolvedValue(false);

      const result = await verifyPassword(password, hashedPassword);

      expect(result).toBe(false);
    });

    it('should handle verification errors', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'scrypt:hashedPassword123';

      (baVerifyPassword as jest.Mock).mockRejectedValue(
        new Error('Comparison failed')
      );

      await expect(verifyPassword(password, hashedPassword)).rejects.toThrow(
        'Comparison failed'
      );
    });
  });

  describe('changePassword', () => {
    const account = {
      id: 'account-1',
      userId: 'user-1',
      providerId: 'credential',
      password: 'scrypt:old',
    };

    beforeEach(() => {
      // beforeEach の resetAllMocks が既定の実装を消すので、ここで設定し直す
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: typeof prisma) => unknown) => fn(prisma)
      );
      (prisma.account.findFirst as jest.Mock).mockResolvedValue(account);
      (baVerifyPassword as jest.Mock).mockResolvedValue(true);
      (baHashPassword as jest.Mock).mockResolvedValue('scrypt:new');
      (prisma.account.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    });

    it('updates the hash and revokes only the other sessions in one transaction', async () => {
      const revoked = await changePassword(
        'user-1',
        'OldPass1',
        'NewPass1',
        'current-token'
      );

      expect(revoked).toBe(2);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.account.updateMany).toHaveBeenCalledWith({
        where: { id: 'account-1', password: 'scrypt:old' },
        data: { password: 'scrypt:new' },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', token: { not: 'current-token' } },
      });
    });

    it('throws without touching the DB when the session token is empty', async () => {
      await expect(
        changePassword('user-1', 'OldPass1', 'NewPass1', '')
      ).rejects.toThrow('Session token is required');

      expect(prisma.account.findFirst).not.toHaveBeenCalled();
      expect(prisma.account.updateMany).not.toHaveBeenCalled();
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('does not update or revoke when the current password is wrong', async () => {
      (baVerifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(
        changePassword('user-1', 'WrongPass1', 'NewPass1', 'current-token')
      ).rejects.toThrow('Invalid current password');

      expect(prisma.account.updateMany).not.toHaveBeenCalled();
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('fails without revoking when the password was changed concurrently', async () => {
      (prisma.account.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        changePassword('user-1', 'OldPass1', 'NewPass1', 'current-token')
      ).rejects.toThrow('Password was changed concurrently');

      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('throws User not found when there is no credential account', async () => {
      (prisma.account.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        changePassword('user-1', 'OldPass1', 'NewPass1', 'current-token')
      ).rejects.toThrow('User not found');
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

      expect(bcrypt.hash).toHaveBeenCalledWith(
        mockUserData.password,
        SALT_ROUNDS
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: mockUserData.email,
            password: hashedPassword,
            name: mockUserData.name,
          }),
        })
      );

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

      await expect(createUser(mockUserData)).rejects.toThrow(
        'User already exists'
      );

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during user creation', async () => {
      const hashedPassword = 'hashedPassword123';

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (prisma.user.create as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

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
