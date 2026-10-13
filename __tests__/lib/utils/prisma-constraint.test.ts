/**
 * Unit tests for Prisma constraint extraction
 */

import {
  describePrismaErrorConstraint,
  getPrismaErrorConstraint,
  getPrismaErrorFields,
  isUniqueConstraintViolationOn,
} from '@/lib/utils/prisma-constraint';

// @prisma/adapter-pg 7.10 以降の一意制約違反（制約名が入る）
const adapterUniqueByIndex = {
  code: 'P2002',
  meta: {
    modelName: 'Article',
    driverAdapterError: {
      cause: {
        kind: 'UniqueConstraintViolation',
        constraint: { index: 'Article_url_key' },
        table: 'Article',
      },
    },
  },
};

// @prisma/adapter-pg 7.9 以前の一意制約違反（列名が入る）
const adapterUniqueByFields = {
  code: 'P2002',
  meta: {
    driverAdapterError: {
      cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['url'] } },
    },
  },
};

describe('prisma-constraint', () => {
  describe('getPrismaErrorConstraint', () => {
    it('reads the index name from the driver adapter error', () => {
      expect(getPrismaErrorConstraint(adapterUniqueByIndex)).toEqual({
        index: 'Article_url_key',
        model: 'Article',
      });
    });

    it('reads the fields from the driver adapter error', () => {
      expect(getPrismaErrorConstraint(adapterUniqueByFields)).toEqual({
        fields: ['url'],
      });
    });

    it('reads meta.target as fields or index', () => {
      expect(getPrismaErrorConstraint({ meta: { target: ['url'] } })).toEqual({
        fields: ['url'],
      });
      expect(
        getPrismaErrorConstraint({ meta: { target: 'Article_url_key' } })
      ).toEqual({ index: 'Article_url_key' });
    });

    it('reads meta.field_name and meta.constraint', () => {
      expect(
        getPrismaErrorConstraint({ meta: { field_name: 'Favorite_userId_fkey' } })
      ).toEqual({ index: 'Favorite_userId_fkey' });
      expect(
        getPrismaErrorConstraint({ meta: { constraint: 'Favorite_userId_fkey' } })
      ).toEqual({ index: 'Favorite_userId_fkey' });
    });

    it('ignores empty fields and falls back to the index or legacy meta', () => {
      expect(
        getPrismaErrorConstraint({
          meta: { driverAdapterError: { cause: { constraint: { fields: [], index: 'Article_url_key' } } } },
        })
      ).toEqual({ index: 'Article_url_key' });
      expect(
        getPrismaErrorConstraint({
          meta: { target: ['url'], driverAdapterError: { cause: { constraint: { fields: [] } } } },
        })
      ).toEqual({ fields: ['url'] });
    });

    it('returns undefined when no constraint is present', () => {
      expect(getPrismaErrorConstraint(new Error('x'))).toBeUndefined();
      expect(getPrismaErrorConstraint({ meta: { modelName: 'Article' } })).toBeUndefined();
      expect(getPrismaErrorConstraint(null)).toBeUndefined();
      expect(getPrismaErrorConstraint('P2002')).toBeUndefined();
    });
  });

  describe('describePrismaErrorConstraint', () => {
    it('prefers field names and falls back to the index name', () => {
      expect(describePrismaErrorConstraint(adapterUniqueByFields)).toBe('url');
      expect(describePrismaErrorConstraint(adapterUniqueByIndex)).toBe('Article_url_key');
      expect(describePrismaErrorConstraint({ meta: {} })).toBeUndefined();
    });
  });

  describe('getPrismaErrorFields', () => {
    it('returns only column names, never the constraint name', () => {
      expect(getPrismaErrorFields(adapterUniqueByFields)).toBe('url');
      expect(getPrismaErrorFields(adapterUniqueByIndex)).toBeUndefined();
    });
  });

  describe('isUniqueConstraintViolationOn', () => {
    it('matches the default unique constraint name', () => {
      expect(isUniqueConstraintViolationOn(adapterUniqueByIndex, 'Article', 'url')).toBe(true);
    });

    it('matches the field names', () => {
      expect(isUniqueConstraintViolationOn(adapterUniqueByFields, 'Article', 'url')).toBe(true);
      expect(
        isUniqueConstraintViolationOn({ code: 'P2002', meta: { target: ['url'] } }, 'Article', 'url')
      ).toBe(true);
    });

    it('does not match another field or model', () => {
      expect(isUniqueConstraintViolationOn(adapterUniqueByIndex, 'Article', 'title')).toBe(false);
      expect(isUniqueConstraintViolationOn(adapterUniqueByIndex, 'Source', 'url')).toBe(false);
    });

    it('does not match a composite unique constraint or another model by field names', () => {
      expect(
        isUniqueConstraintViolationOn(
          { code: 'P2002', meta: { target: ['url', 'sourceId'] } },
          'Article',
          'url'
        )
      ).toBe(false);
      expect(
        isUniqueConstraintViolationOn(
          { code: 'P2002', meta: { modelName: 'Source', target: ['url'] } },
          'Article',
          'url'
        )
      ).toBe(false);
    });

    it('does not match other error codes or missing constraints', () => {
      expect(
        isUniqueConstraintViolationOn({ ...adapterUniqueByIndex, code: 'P2003' }, 'Article', 'url')
      ).toBe(false);
      expect(isUniqueConstraintViolationOn({ code: 'P2002', meta: {} }, 'Article', 'url')).toBe(false);
      expect(isUniqueConstraintViolationOn(new Error('x'), 'Article', 'url')).toBe(false);
    });
  });
});
