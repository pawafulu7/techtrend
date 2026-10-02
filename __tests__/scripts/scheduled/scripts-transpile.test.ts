/**
 * scripts/scheduled/ のスクリプトが tsx（esbuild）で読み込めることを検証する。
 *
 * scripts/scheduled/ は tsconfig の exclude 対象で `npm run type-check` も
 * Next.js のビルドも見ない。Jest（SWC）は esbuild が拒否する構文
 * （同名の export の重複など）を通すため、定期実行が読み込み時に落ちても
 * どこにも出ない。定期実行と同じ esbuild の変換をここで通す。
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';

const root = path.join(process.cwd(), 'scripts/scheduled');

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const files = listTsFiles(root).map((f) => path.relative(process.cwd(), f));

describe('scripts/scheduled のスクリプトを esbuild で変換できる', () => {
  it('対象のファイルが見つかる', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(() =>
      transformSync(source, {
        loader: 'ts',
        format: 'cjs',
        platform: 'node',
        sourcefile: file,
        logLevel: 'silent',
      })
    ).not.toThrow();
  });
});
