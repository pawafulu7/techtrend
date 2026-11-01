/**
 * 依存の向き: lib/ と scripts/ は画面のコード（app/・components/）を import しない
 * （docs/architecture/06-directory-structure.md）
 *
 * eslint の no-restricted-imports（eslint.config.mjs の uiLayerImportRestriction）は、
 * lint の対象外の scripts/（scheduled/ 以外）には効かない。ここで全ファイルを見る。
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = ['lib', 'scripts'];
const UI_DIRS = ['app', 'components'].map((dir) => path.join(ROOT, dir) + path.sep);
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // テスト・ローカルの一時ファイルは対象外
      return ['__tests__', 'temp', 'node_modules'].includes(entry.name) ? [] : listSourceFiles(full);
    }
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

/** import の文字列が app/・components/ を指すか（別名 @/ と相対パスを解決して判定する） */
function pointsToUiLayer(fromFile: string, specifier: string): boolean {
  let target: string;
  if (specifier.startsWith('@/')) {
    target = path.join(ROOT, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    target = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return false;
  }
  return UI_DIRS.some((dir) => (target + path.sep).startsWith(dir));
}

describe('lib/ と scripts/ の依存の向き', () => {
  it('判定: 別名と相対パスの両方で app/・components/ を見分ける', () => {
    const from = path.join(ROOT, 'lib/articles/example.ts');
    expect(pointsToUiLayer(from, '@/app/hooks/use-toast')).toBe(true);
    expect(pointsToUiLayer(from, '../../components/ui/button')).toBe(true);
    expect(pointsToUiLayer(from, '@/lib/utils')).toBe(false);
    expect(pointsToUiLayer(from, '../utils/date')).toBe(false);
    expect(pointsToUiLayer(from, 'react')).toBe(false);
  });

  it('app/・components/ を import しているファイルが無い', () => {
    const violations = SOURCE_DIRS.flatMap((dir) => listSourceFiles(path.join(ROOT, dir))).flatMap(
      (file) => {
        const source = fs.readFileSync(file, 'utf-8');
        return [...source.matchAll(SPECIFIER)]
          .map((match) => match[1])
          .filter((specifier) => pointsToUiLayer(file, specifier))
          .map((specifier) => `${path.relative(ROOT, file)} -> ${specifier}`);
      }
    );

    expect(violations).toEqual([]);
  });
});
