/**
 * @jest-environment node
 */

const mockSupportsIterativeScan = jest.fn();
jest.mock('@/lib/personalization/filters/pgvector-capabilities', () => ({
  supportsIterativeScan: (...args: unknown[]) =>
    mockSupportsIterativeScan(...args),
}));

import {
  buildStage1Plan,
  getLegacyEfSearch,
  runStage1Knn,
  STAGE1_ITERATIVE_EF_SEARCH,
} from '@/lib/personalization/filters/stage1-knn';

const centroid = '[0.1,0.2,0.3]';
const cutoffDate = new Date('2026-07-01T00:00:00Z');

/** Prisma.Sql の SQL 文（空白を詰める） */
function sqlText(query: { sql: string }): string {
  return query.sql.replace(/\s+/g, ' ');
}

/** 設定とクエリを db ではなく tx 側で受ける Prisma のモック */
function createDb() {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ articleId: 'a1', sim_emb: 0.9 }]),
  };
  const db = {
    $executeRawUnsafe: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { db, tx };
}

describe('stage1-knn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildStage1Plan - iterative', () => {
    it('Article と結合し、期間・非表示・要約済みの条件を Stage 1 で掛ける', () => {
      const plan = buildStage1Plan({
        mode: 'iterative',
        centroid,
        limit: 200,
        cutoffDate,
      });
      const sql = sqlText(plan.query);

      expect(sql).toContain('INNER JOIN "Article" a ON a.id = e."articleId"');
      expect(sql).toContain('a."isHidden" = false');
      expect(sql).toContain('a."summaryComputedAt" IS NOT NULL');
      expect(sql).toContain('a."publishedAt" >=');
      expect(plan.query.values).toEqual(
        expect.arrayContaining([centroid, cutoffDate, 200])
      );
      expect(plan.periodApplied).toBe(true);
    });

    it('期間が無ければ期間の条件を入れない', () => {
      const plan = buildStage1Plan({
        mode: 'iterative',
        centroid,
        limit: 200,
        cutoffDate: null,
      });

      expect(sqlText(plan.query)).not.toContain('"publishedAt"');
      expect(plan.query.values).not.toContain(cutoffDate);
      expect(plan.periodApplied).toBe(false);
    });

    it('iterative scan と計画の固定をトランザクションに閉じた設定で掛け、ef_search は k によらず定数', () => {
      const small = buildStage1Plan({
        mode: 'iterative',
        centroid,
        limit: 50,
        cutoffDate,
      });
      const large = buildStage1Plan({
        mode: 'iterative',
        centroid,
        limit: 300,
        cutoffDate,
      });

      for (const plan of [small, large]) {
        expect(plan.efSearch).toBe(STAGE1_ITERATIVE_EF_SEARCH);
        expect(plan.settingsSql).toContain(
          `set_config('hnsw.ef_search', '${STAGE1_ITERATIVE_EF_SEARCH}', true)`
        );
        expect(plan.settingsSql).toContain(
          "set_config('hnsw.iterative_scan', 'relaxed_order', true)"
        );
        expect(plan.settingsSql).toContain(
          "set_config('hnsw.scan_mem_multiplier', '2', true)"
        );
        expect(plan.settingsSql).toContain(
          "set_config('enable_seqscan', 'off', true)"
        );
        expect(plan.settingsSql).toContain(
          "set_config('enable_bitmapscan', 'off', true)"
        );
        expect(plan.settingsSql).toContain(
          "set_config('enable_sort', 'off', true)"
        );
      }
    });
  });

  describe('buildStage1Plan - legacy', () => {
    it('期間を見ない全体の kNN で、iterative scan の設定を掛けない', () => {
      const plan = buildStage1Plan({
        mode: 'legacy',
        centroid,
        limit: 200,
        cutoffDate,
      });
      const sql = sqlText(plan.query);

      expect(sql).not.toContain('"Article"');
      expect(sql).not.toContain('"publishedAt"');
      expect(plan.query.values).not.toContain(cutoffDate);
      expect(plan.periodApplied).toBe(false);
      expect(plan.settingsSql).not.toContain('iterative_scan');
      expect(plan.settingsSql).not.toContain('scan_mem_multiplier');
      expect(plan.settingsSql).toContain(
        "set_config('hnsw.ef_search', '200', true)"
      );
      expect(plan.settingsSql).toContain(
        "set_config('enable_seqscan', 'off', true)"
      );
      expect(plan.settingsSql).toContain(
        "set_config('enable_bitmapscan', 'off', true)"
      );
      expect(plan.settingsSql).toContain(
        "set_config('enable_sort', 'off', true)"
      );
    });

    it.each([
      [10, 40],
      [200, 200],
      [300, 300],
      [250.7, 250],
      [5000, 1000],
    ])('ef_search は LIMIT %p から %p（40〜1000 に丸める）', (limit, ef) => {
      expect(getLegacyEfSearch(limit)).toBe(ef);
    });
  });

  describe('runStage1Knn', () => {
    it('pgvector 0.8 以上なら iterative 経路で、設定と kNN を同じ tx で設定→kNN の順に実行する', async () => {
      mockSupportsIterativeScan.mockResolvedValue(true);
      const { db, tx } = createDb();

      const { rows, plan } = await runStage1Knn(db as any, {
        centroid,
        limit: 200,
        cutoffDate,
      });

      expect(plan.mode).toBe('iterative');
      expect(rows).toEqual([{ articleId: 'a1', sim_emb: 0.9 }]);
      expect(mockSupportsIterativeScan).toHaveBeenCalledWith(db);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(plan.settingsSql);
      expect(tx.$queryRaw).toHaveBeenCalledWith(plan.query);
      expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
        tx.$queryRaw.mock.invocationCallOrder[0]
      );
      // トランザクションの外（別の接続）では実行しない
      expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it('pgvector 0.8 未満なら legacy 経路', async () => {
      mockSupportsIterativeScan.mockResolvedValue(false);
      const { db, tx } = createDb();

      const { plan } = await runStage1Knn(db as any, {
        centroid,
        limit: 200,
        cutoffDate,
      });

      expect(plan.mode).toBe('legacy');
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(plan.settingsSql);
      expect(plan.settingsSql).not.toContain('iterative_scan');
    });

    it('kNN が失敗したら、設定なしで引き直さずに投げる', async () => {
      mockSupportsIterativeScan.mockResolvedValue(true);
      const { db, tx } = createDb();
      tx.$queryRaw.mockRejectedValueOnce(new Error('knn failed'));

      await expect(
        runStage1Knn(db as any, { centroid, limit: 200, cutoffDate })
      ).rejects.toThrow('knn failed');
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it('設定が失敗したら kNN を実行せずに投げる', async () => {
      mockSupportsIterativeScan.mockResolvedValue(true);
      const { db, tx } = createDb();
      tx.$executeRawUnsafe.mockRejectedValueOnce(new Error('set failed'));

      await expect(
        runStage1Knn(db as any, { centroid, limit: 200, cutoffDate })
      ).rejects.toThrow('set failed');
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
