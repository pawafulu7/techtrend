/**
 * 本番のマイグレーションの適用状況の判定（scripts/db/migration-status.ts）
 */
import {
  localMigrationNames,
  summarizeMigrations,
  type MigrationRecord,
} from '@/scripts/db/migration-status';

const record = (
  migration_name: string,
  finished: boolean,
  rolled_back = false
): MigrationRecord => ({ migration_name, finished, rolled_back });

describe('summarizeMigrations', () => {
  it('reports nothing pending when every local migration is applied', () => {
    const status = summarizeMigrations(
      ['20260101000000_a', '20260102000000_b'],
      [record('20260101000000_a', true), record('20260102000000_b', true)]
    );
    expect(status).toEqual({ local: 2, applied: 2, pending: [], failed: [], unknown: [] });
  });

  it('lists pending, failed and unknown migrations', () => {
    const status = summarizeMigrations(
      ['20260101000000_a', '20260102000000_b', '20260103000000_c'],
      [
        record('20260101000000_a', true),
        // 失敗して取り消した後、直して適用し直したもの（適用済み）
        record('20260102000000_b', false, true),
        record('20260102000000_b', true),
        // 失敗したまま残っているもの（P3009）
        record('20260103000000_c', false),
        // このコードに無いが、DB では適用済みのもの
        record('20260104000000_d', true),
      ]
    );
    expect(status.applied).toBe(3);
    expect(status.pending).toEqual(['20260103000000_c']);
    expect(status.failed).toEqual(['20260103000000_c']);
    expect(status.unknown).toEqual(['20260104000000_d']);
  });

  it('does not count a migration that was rolled back after it finished as applied', () => {
    const status = summarizeMigrations(['20260101000000_a'], [record('20260101000000_a', true, true)]);
    expect(status.pending).toEqual(['20260101000000_a']);
    expect(status.failed).toEqual([]);
  });
});

describe('localMigrationNames', () => {
  it('reads the migration directories of this repository', () => {
    const names = localMigrationNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort());
    for (const name of names) expect(name).toMatch(/^[0-9]{8}[0-9]*_[A-Za-z0-9_]+$/);
  });
});
