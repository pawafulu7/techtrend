import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

// lib/ と scripts/ から画面のコード（app/・components/）を import しない規則（eslint.config.mjs の
// uiLayerImportRestriction）が、no-restricted-imports を上書きする設定（enricher）でも残ることを、
// 実際の設定で確かめる
const eslint = new ESLint();

async function uiLayerViolations(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  assert.ok(!result.messages.some((entry) => entry.fatal), 'Snippet must parse');
  return result.messages.filter(
    (entry) => entry.ruleId === 'no-restricted-imports' && entry.message.includes('画面のコード')
  );
}

const imports = [
  "import { useToast } from '@/app/hooks/use-toast';",
  "import { Button } from '@/components/ui-v2/button-v2';",
  "import { useToast } from '../../app/hooks/use-toast';",
];

for (const filePath of [
  'lib/articles/example.ts',
  'lib/enrichers/example.ts',
  'scripts/scheduled/example.ts',
]) {
  test(`rejects UI imports in ${filePath}`, async () => {
    for (const code of imports) {
      const violations = await uiLayerViolations(`${code}\nexport const x = 1;`, filePath);
      assert.equal(violations.length, 1, code);
      assert.equal(violations[0].severity, 2);
    }
  });
}

test('allows lib imports in lib/', async () => {
  for (const code of ["import { cn } from '@/lib/utils';", "import { formatDate } from '../utils/date';"]) {
    assert.equal((await uiLayerViolations(`${code}\nexport const x = 1;`, 'lib/articles/example.ts')).length, 0, code);
  }
});

test('does not restrict app/', async () => {
  const violations = await uiLayerViolations(`${imports[0]}\nexport const x = 1;`, 'app/components/example.ts');
  assert.equal(violations.length, 0);
});
