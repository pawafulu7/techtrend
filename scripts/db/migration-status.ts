/**
 * prisma/migrations のマイグレーションと、DB の _prisma_migrations の記録を比べる。
 * 手元の読み取り用ロールは失敗のログ（logs 列）を読めず、prisma migrate status が権限で止まるので、
 * 読める列（migration_name・finished_at・rolled_back_at）だけで状態を出す
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

export interface MigrationRecord {
  migration_name: string;
  finished: boolean;
  rolled_back: boolean;
}

export interface MigrationStatus {
  local: number;
  applied: number;
  /** prisma/migrations にあり、DB で適用済みになっていないもの */
  pending: string[];
  /** 始まったが終わっておらず、取り消してもいないもの（prisma migrate deploy が P3009 で止まる） */
  failed: string[];
  /** DB で適用済みだが prisma/migrations に無いもの（このコードより新しい DB） */
  unknown: string[];
}

export const MIGRATION_RECORDS_SQL = `SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
  FROM public."_prisma_migrations"`;

/** prisma/migrations の下のマイグレーションの名前（ディレクトリだけ） */
export function localMigrationNames(root = process.cwd()): string[] {
  return readdirSync(path.join(root, 'prisma/migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function summarizeMigrations(
  localNames: string[],
  records: MigrationRecord[]
): MigrationStatus {
  const applied = new Set(
    records.filter((r) => r.finished && !r.rolled_back).map((r) => r.migration_name)
  );
  const local = new Set(localNames);
  const failed = [
    ...new Set(
      records
        .filter((r) => !r.finished && !r.rolled_back && !applied.has(r.migration_name))
        .map((r) => r.migration_name)
    ),
  ].sort();
  return {
    local: local.size,
    applied: applied.size,
    pending: [...local].filter((name) => !applied.has(name)).sort(),
    failed,
    unknown: [...applied].filter((name) => !local.has(name)).sort(),
  };
}
