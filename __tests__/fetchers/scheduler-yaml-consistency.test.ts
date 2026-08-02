import fs from 'fs';
import path from 'path';
import { FOREIGN_SOURCE_CONFIGS } from '@/lib/fetchers/generic-foreign-rss';

/**
 * スケジューラ整合性テスト（Issue #628 / #407型事故の再発防止）
 *
 * FOREIGN_SOURCE_CONFIGS に定義されたソース名が、実際に収集を起動する
 * 2系統のスケジューラ（GHAワークフローのCLI引数 / ローカルscheduler.tsの配列）に
 * 完全一致で存在することを検証する。
 *
 * collect-feeds.ts は `WHERE id IN (...) OR name IN (...)` の完全一致で
 * ソースを絞り込むため、includes() の部分一致では「CLI引数として渡される」
 * ことを保証できない（コメント中の文字列や別名の部分一致を誤検知する）。
 */

const ROOT = process.cwd();

/** YAMLの run ブロックから、行単位の引用済みCLI引数（`"名前" \` 形式）を抽出する */
function extractYamlCliArgs(yamlPath: string): string[] {
  const text = fs.readFileSync(yamlPath, 'utf-8');
  const args: string[] = [];
  for (const line of text.split('\n')) {
    // 例: `            "はてなブックマーク" \` / 最終行はバックスラッシュなし
    const m = line.match(/^\s+"([^"]+)"\s*\\?\s*$/);
    if (m) args.push(m[1]);
  }
  return args;
}

/** scheduler.ts から指定した配列定数の文字列要素を抽出する */
function extractSchedulerArraySources(varName: string): string[] {
  const text = fs.readFileSync(
    path.join(ROOT, 'scripts/scheduled/scheduler.ts'),
    'utf-8'
  );
  const block = text.match(
    new RegExp(`const ${varName}\\s*=\\s*\\[([\\s\\S]*?)\\];`)
  );
  if (!block) {
    throw new Error(`${varName} array not found in scheduler.ts`);
  }
  return [...block[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map(
    (m) => m[1] ?? m[2]
  );
}

/**
 * 収集経路に載らないことが確認済みの正当な除外リスト（理由必須）。
 * 安易な追加は #407 型事故（実装済みだが収集されない）の温床になる。
 */
const EXCLUDED_KEYS: Record<string, string> = {};

describe('スケジューラ整合性: FOREIGN_SOURCE_CONFIGS ⇔ 収集起動リスト', () => {
  const ghaArgs = new Set([
    ...extractYamlCliArgs(
      path.join(ROOT, '.github/workflows/scheduler-rss-hourly.yml')
    ),
    ...extractYamlCliArgs(
      path.join(ROOT, '.github/workflows/scheduler-scraping.yml')
    ),
  ]);
  const localSources = new Set([
    ...extractSchedulerArraySources('RSS_SOURCES'),
    ...extractSchedulerArraySources('SCRAPING_SOURCES'),
  ]);
  const keys = Object.keys(FOREIGN_SOURCE_CONFIGS).filter(
    (k) => !(k in EXCLUDED_KEYS)
  );

  it('抽出ロジックが機能している（空リストによる偽陰性の防止）', () => {
    expect(ghaArgs.size).toBeGreaterThan(0);
    expect(localSources.size).toBeGreaterThan(0);
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)(
    '"%s" が GHA ワークフローの CLI 引数に完全一致で存在する',
    (key) => {
      expect(ghaArgs.has(key)).toBe(true);
    }
  );

  it.each(keys)(
    '"%s" がローカルスケジューラ (scheduler.ts) のソース配列に存在する',
    (key) => {
      expect(localSources.has(key)).toBe(true);
    }
  );
});
