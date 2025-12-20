/**
 * Unit tests for Prisma error handler
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  handlePrismaError,
  isPrismaFkError,
  isPrismaNotFoundError,
} from '@/lib/utils/prisma-error-handler';

describe('prisma-error-handler', () => {
  describe('handlePrismaError', () => {
    it('returns null for non-Prisma errors', () => {
      const error = new Error('Regular error');
      const result = handlePrismaError(error);
      expect(result).toBeNull();
    });

    it('returns null for unknown Prisma errors', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unknown error', {
        code: 'P9999',
        clientVersion: '5.0.0',
      });
      const result = handlePrismaError(error);
      expect(result).toBeNull();
    });

    describe('P2003 - FK constraint violation', () => {
      it('returns 401 for Favorite_userId FK violation', async () => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint failed',
          {
            code: 'P2003',
            clientVersion: '5.0.0',
            meta: { field_name: 'Favorite_userId_fkey' },
          }
        );

        const result = handlePrismaError(error);

        expect(result).toBeInstanceOf(NextResponse);
        expect(result!.status).toBe(401);

        const body = await result!.json();
        expect(body).toEqual({
          error: 'Session invalid',
          code: 'USER_DELETED',
          message: 'Your session is no longer valid. Please sign in again.',
          requiresLogout: true,
        });
      });

      it('returns 401 for ArticleView_userId FK violation', async () => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint failed',
          {
            code: 'P2003',
            clientVersion: '5.0.0',
            meta: { field_name: 'ArticleView_userId_fkey' },
          }
        );

        const result = handlePrismaError(error);

        expect(result).toBeInstanceOf(NextResponse);
        expect(result!.status).toBe(401);
      });

      it('returns 400 for non-user FK violation', async () => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint failed',
          {
            code: 'P2003',
            clientVersion: '5.0.0',
            meta: { field_name: 'Article_sourceId_fkey' },
          }
        );

        const result = handlePrismaError(error);

        expect(result).toBeInstanceOf(NextResponse);
        expect(result!.status).toBe(400);

        const body = await result!.json();
        expect(body).toEqual({
          error: 'Database constraint violation',
          code: 'FK_CONSTRAINT_ERROR',
        });
      });
    });

    describe('P2025 - Record not found', () => {
      it('returns 404 for record not found error', async () => {
        const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.0.0',
        });

        const result = handlePrismaError(error);

        expect(result).toBeInstanceOf(NextResponse);
        expect(result!.status).toBe(404);

        const body = await result!.json();
        expect(body).toEqual({
          error: 'Resource not found',
          code: 'NOT_FOUND',
        });
      });
    });
  });

  describe('isPrismaFkError', () => {
    it('returns true for P2003 error', () => {
      const error = new Prisma.PrismaClientKnownRequestError('FK error', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      expect(isPrismaFkError(error)).toBe(true);
    });

    it('returns false for other Prisma errors', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Other error', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      expect(isPrismaFkError(error)).toBe(false);
    });

    it('returns false for non-Prisma errors', () => {
      const error = new Error('Regular error');
      expect(isPrismaFkError(error)).toBe(false);
    });
  });

  describe('isPrismaNotFoundError', () => {
    it('returns true for P2025 error', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      expect(isPrismaNotFoundError(error)).toBe(true);
    });

    it('returns false for other Prisma errors', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Other error', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      expect(isPrismaNotFoundError(error)).toBe(false);
    });

    it('returns false for non-Prisma errors', () => {
      const error = new Error('Regular error');
      expect(isPrismaNotFoundError(error)).toBe(false);
    });
  });
});
