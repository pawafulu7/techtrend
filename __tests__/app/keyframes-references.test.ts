import fs from 'fs';
import path from 'path';

/**
 * Tailwind の任意値クラス `animate-[名前_...]` が参照する @keyframes が定義されているかを確かめる（issue #710）。
 *
 * 任意値クラスはキーフレームを生成しない。globals.css から名前の参照を見落として消すと、
 * `motion-safe:opacity-0` から表示へ進むアニメーションが無くなり、中身が透明のままになる
 * （詳細要約・AI 検索の回答で起きた）。CSS 側の未使用チェックはクラス名しか見ないので、ここで名前を突き合わせる。
 */

const ROOT = process.cwd();
const SOURCE_DIRS = ['app', 'components', 'lib'];
const CSS_FILES = ['app/globals.css', 'app/generated-tokens.css'];
// Tailwind が既定で持つキーフレーム
const TAILWIND_KEYFRAMES = new Set(['spin', 'ping', 'pulse', 'bounce']);

function listSourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__tests__'
        ? []
        : listSourceFiles(rel);
    }
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [rel] : [];
  });
}

function keyframeNames(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)].map((m) => m[1])
  );
}

const globalKeyframes = new Set(
  CSS_FILES.flatMap((file) => [
    ...keyframeNames(fs.readFileSync(path.join(ROOT, file), 'utf-8')),
  ])
);

const references = SOURCE_DIRS.flatMap(listSourceFiles).flatMap((file) => {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf-8');
  const local = keyframeNames(text); // styled-jsx などで同じファイルに定義したもの
  return [...text.matchAll(/animate-\[([A-Za-z_][\w-]*)_/g)].map((m) => ({
    file,
    name: m[1],
    local,
  }));
});

describe('animate-[名前_...] が参照する @keyframes', () => {
  it('参照を見つけられる（抽出が空で素通りしないこと）', () => {
    expect(references.length).toBeGreaterThan(0);
  });

  it.each(references.map((r) => [r.name, r.file, r] as const))(
    '%s（%s）が定義されている',
    (_name, _file, ref) => {
      const defined =
        globalKeyframes.has(ref.name) ||
        TAILWIND_KEYFRAMES.has(ref.name) ||
        ref.local.has(ref.name);
      expect(defined).toBe(true);
    }
  );
});
