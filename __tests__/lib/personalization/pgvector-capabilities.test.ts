/**
 * @jest-environment node
 */

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { logger } from '@/lib/logger';
import {
  isIterativeScanSupported,
  parsePgvectorVersion,
  resetPgvectorCapabilitiesForTest,
  supportsIterativeScan,
} from '@/lib/personalization/filters/pgvector-capabilities';

function createDb(queryRaw: jest.Mock) {
  return { $queryRaw: queryRaw } as any;
}

describe('pgvector-capabilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPgvectorCapabilitiesForTest();
  });

  describe('parsePgvectorVersion', () => {
    it.each([
      ['0.8.2', [0, 8, 2]],
      ['0.10.0', [0, 10, 0]],
      ['0.8', [0, 8, 0]],
      [' 0.7.4 ', [0, 7, 4]],
    ])('%s を数値の組にする', (input, expected) => {
      expect(parsePgvectorVersion(input)).toEqual(expected);
    });

    it.each([null, undefined, '', 'abc', '0.8.0-beta', '1'])(
      '%p は解析できず null',
      (input) => {
        expect(parsePgvectorVersion(input)).toBeNull();
      }
    );
  });

  describe('isIterativeScanSupported', () => {
    it.each(['0.8.0', '0.8.2', '0.10.0', '1.0.0'])('%s は対応', (version) => {
      expect(isIterativeScanSupported(version)).toBe(true);
    });

    it.each(['0.7.4', '0.5.1', '0.7.99', null, 'garbage'])(
      '%p は非対応',
      (version) => {
        expect(isIterativeScanSupported(version)).toBe(false);
      }
    );
  });

  describe('supportsIterativeScan', () => {
    it('受け取った db で extversion を引き、0.8 以上なら true', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValue([{ extversion: '0.8.2', default_version: '0.8.2' }]);

      await expect(supportsIterativeScan(createDb(queryRaw))).resolves.toBe(
        true
      );
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(String(queryRaw.mock.calls[0][0].join(''))).toContain(
        'pg_extension'
      );
    });

    it('0.8 未満なら false', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValue([{ extversion: '0.7.4', default_version: '0.7.4' }]);

      await expect(supportsIterativeScan(createDb(queryRaw))).resolves.toBe(
        false
      );
    });

    it('拡張が無ければ false', async () => {
      const queryRaw = jest.fn().mockResolvedValue([]);

      await expect(supportsIterativeScan(createDb(queryRaw))).resolves.toBe(
        false
      );
    });

    it('結果を保持し、2 回目以降は引かない', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValue([{ extversion: '0.8.2', default_version: '0.8.2' }]);
      const db = createDb(queryRaw);

      await supportsIterativeScan(db);
      await supportsIterativeScan(db);

      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('並行して呼んでも 1 回だけ引く', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValue([{ extversion: '0.8.2', default_version: '0.8.2' }]);
      const db = createDb(queryRaw);

      const results = await Promise.all([
        supportsIterativeScan(db),
        supportsIterativeScan(db),
        supportsIterativeScan(db),
      ]);

      expect(results).toEqual([true, true, true]);
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('判定のクエリが失敗したら false を返し、保持せずに次で引き直す', async () => {
      const queryRaw = jest
        .fn()
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce([
          { extversion: '0.8.2', default_version: '0.8.2' },
        ]);
      const db = createDb(queryRaw);

      await expect(supportsIterativeScan(db)).resolves.toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        { err: 'connection reset' },
        expect.stringContaining('detection failed')
      );

      await expect(supportsIterativeScan(db)).resolves.toBe(true);
      expect(queryRaw).toHaveBeenCalledTimes(2);
    });

    it('extversion と default_version がずれていたら warn を出す', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValue([{ extversion: '0.7.4', default_version: '0.8.2' }]);

      await expect(supportsIterativeScan(createDb(queryRaw))).resolves.toBe(
        false
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { extversion: '0.7.4', defaultVersion: '0.8.2' },
        expect.stringContaining('ALTER EXTENSION')
      );
    });
  });
});
