import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const message = 'Log exceptions with `{ err: error }`';

async function loggerViolations(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  assert.ok(
    !result.messages.some((entry) => entry.fatal),
    'Snippet must parse'
  );
  return result.messages.filter(
    (entry) =>
      entry.ruleId === 'no-restricted-syntax' &&
      entry.message.startsWith(message)
  );
}

// Test the real config, including the env restrictions that override rule arrays.
for (const filePath of [
  'app/api/example/route.ts',
  'lib/cache/example.ts',
  'lib/logger.ts',
]) {
  test(`rejects error log fields in ${filePath}`, async () => {
    for (const code of [
      "logger.error({ error }, 'Failed');",
      "logger.warn(\n { userId, error: caughtError },\n 'Failed'\n);",
      "logger.info({ 'error': caughtError }, 'Failed');",
      "logger.debug({ ['error']: caughtError }, 'Failed');",
      "logger.trace({ error }, 'Failed');",
      "logger.fatal({ error }, 'Failed');",
      "logger['warn']({ error }, 'Failed');",
      "logger[logLevel]({ error: caughtError }, 'Failed');",
    ]) {
      const violations = await loggerViolations(code, filePath);
      assert.equal(violations.length, 1, code);
      assert.equal(violations[0].severity, 2);
    }
  });

  test(`allows error data outside log fields in ${filePath}`, async () => {
    for (const code of [
      "logger.error({ err: error }, 'Failed');",
      "logger.warn({ errorMessage: 'Failed' }, 'Failed');",
      "logger.error({ result: { error } }, 'Failed');",
      'const result = { success: false, error };',
      'NextResponse.json({ error });',
      'other.error({ error });',
      "logger.info('Result: %o', { error });",
      'logger.child({ errorCount: 3 });',
    ]) {
      assert.equal((await loggerViolations(code, filePath)).length, 0, code);
    }
  });
}

test('keeps the existing env restrictions alongside the logger rule', async () => {
  for (const filePath of ['app/api/example/route.ts', 'lib/cache/example.ts']) {
    const [result] = await eslint.lintText(
      'const secret = process.env.API_KEY;',
      { filePath }
    );
    assert.ok(
      result.messages.some(
        (entry) =>
          entry.ruleId === 'no-restricted-syntax' &&
          entry.message.includes('Use `env`')
      ),
      filePath
    );
  }
});
