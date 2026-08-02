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

/**
 * YAML から collect-feeds.ts に渡される引用済みCLI引数を抽出する。
 *
 * 2種類の記法に対応する:
 *   - 1行1引数 + 行末バックスラッシュ継続（scheduler-rss-hourly.yml）
 *   - 1行にスペース区切りで複数引数（scheduler-scraping.yml）
 *
 * collect-feeds.ts の起動行から継続行までに限定して抽出するため、
 * 環境変数値・cron 式・コメント中の引用文字列を誤って拾わない。
 */
function extractYamlCliArgs(yamlPath: string): string[] {
  const lines = fs.readFileSync(yamlPath, 'utf-8').split('\n');
  const args: string[] = [];
  let inCommand = false;

  for (const line of lines) {
    if (!inCommand && line.includes('collect-feeds.ts')) {
      inCommand = true;
    }
    if (!inCommand) continue;

    for (const m of line.matchAll(/"([^"]+)"/g)) {
      args.push(m[1]);
    }
    // 行末のバックスラッシュが無ければコマンド終端
    if (!/\\\s*$/.test(line)) break;
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

const GHA_WORKFLOWS = [
  '.github/workflows/scheduler-rss-hourly.yml',
  '.github/workflows/scheduler-scraping.yml',
];

describe('スケジューラ整合性: FOREIGN_SOURCE_CONFIGS ⇔ 収集起動リスト', () => {
  const argsByWorkflow = GHA_WORKFLOWS.map(
    (rel) => [rel, extractYamlCliArgs(path.join(ROOT, rel))] as const
  );
  const ghaArgs = new Set(argsByWorkflow.flatMap(([, args]) => args));
  const localSources = new Set([
    ...extractSchedulerArraySources('RSS_SOURCES'),
    ...extractSchedulerArraySources('SCRAPING_SOURCES'),
  ]);
  const keys = Object.keys(FOREIGN_SOURCE_CONFIGS).filter(
    (k) => !(k in EXCLUDED_KEYS)
  );

  // 抽出が空配列を返すと「全キーが存在しない」ではなく比較自体が無意味になるため、
  // ワークフローごとに個別に抽出成功を確認する（合算での確認では
  // 片方の記法に非対応でも気付けない）
  it.each(argsByWorkflow)('%s から CLI 引数を抽出できる', (_rel, args) => {
    expect(args.length).toBeGreaterThan(0);
  });

  it('抽出ロジックが機能している（空リストによる偽陰性の防止）', () => {
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
