/**
 * summarizeError が、例外の種類とコードだけを出し、message（接続先が入りうる）を出さないこと
 */
import { summarizeError } from '@/lib/utils/sanitize-error';

const HOST = 'db.example.com';

function withCode<T extends Error>(
  error: T,
  fields: Record<string, unknown>
): T {
  return Object.assign(error, fields);
}

describe('summarizeError', () => {
  it('message を出さず、name と code だけを出す', () => {
    const error = withCode(
      new Error(`Can't reach database server at \`${HOST}:5432\``),
      {
        code: 'P1001',
      }
    );
    error.name = 'PrismaClientInitializationError';

    expect(summarizeError(error)).toBe(
      'PrismaClientInitializationError code=P1001'
    );
  });

  it('errorCode・status・statusCode の数値も出す', () => {
    const error = withCode(new Error(`at ${HOST}`), {
      errorCode: 'P1000',
      status: 429,
      statusCode: 503,
    });

    expect(summarizeError(error)).toBe(
      'Error errorCode=P1000 status=429 statusCode=503'
    );
  });

  it('決まった形に合わない code と name は出さない', () => {
    const error = withCode(new Error('x'), {
      code: HOST,
      status: '429',
      statusCode: 1.5,
    });
    error.name = `Error ${HOST}`;

    expect(summarizeError(error)).toBe('Error');
  });

  it('cause を辿り、それぞれの name と code を出す', () => {
    const inner = withCode(new Error(`connect ECONNREFUSED 192.0.2.1:5432`), {
      code: 'ECONNREFUSED',
    });
    const outer = new Error(`failed: ${HOST}`, { cause: inner });

    expect(summarizeError(outer)).toBe(
      'Error <- cause: Error code=ECONNREFUSED'
    );
  });

  it('cause が null なら辿らない', () => {
    expect(summarizeError(new Error(HOST, { cause: null }))).toBe('Error');
  });

  it('Error でない値は型だけを出す', () => {
    expect(summarizeError(`postgresql://user:pass@${HOST}/db`)).toBe(
      'non-Error (string)'
    );
    expect(summarizeError(null)).toBe('non-Error (null)');
    expect(summarizeError({ message: HOST })).toBe('non-Error (object)');
  });

  it('stack は message の後の at の行だけを出す。複数行の message に紛れた at の行は出さない', () => {
    const error = new Error(`first line\n    at ${HOST}:5432\nlast line`);
    error.stack = `Error: ${error.message}\n    at main (/app/scripts/scheduled/x.ts:10:5)\n    at run (node:internal/modules/cjs/loader:1554:14)`;

    const summary = summarizeError(error, { stack: true });

    expect(summary).toBe(
      'Error\n    at main (/app/scripts/scheduled/x.ts:10:5)\n    at run (node:internal/modules/cjs/loader:1554:14)'
    );
    expect(summary).not.toContain(HOST);
  });

  it('stack が message で始まらないときは frame を出さない', () => {
    const error = new Error(HOST);
    error.stack = `Something else\n    at ${HOST}`;

    expect(summarizeError(error, { stack: true })).toBe('Error');
  });

  it('数値の code を出す', () => {
    expect(summarizeError(withCode(new Error(HOST), { code: 1 }))).toBe('Error code=1');
  });

  it('循環する cause は深さの上限で打ち切る', () => {
    const a = new Error(HOST);
    const b = new Error(HOST, { cause: a });
    Object.assign(a, { cause: b });

    expect(summarizeError(a).split(' <- cause: ')).toHaveLength(4);
  });

  it('別の realm で作られた Error も種類とコードを出す', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vm = require('vm') as typeof import('vm');
    const foreign = vm.runInNewContext('Object.assign(new TypeError(m), { code: "ECONNREFUSED" })', {
      m: HOST,
    });

    expect(summarizeError(foreign)).toBe('TypeError code=ECONNREFUSED');
  });

  it('frame の形をした行でも、ファイルの位置が URL なら出さない', () => {
    const error = new Error('failure');
    error.stack = [
      'Error: failure',
      `    at connect (postgresql://user:pass@${HOST}/app:1:2)`,
      `    at ${HOST}:5432`,
      '    at Object.<anonymous> (/app/scripts/scheduled/x.ts:3:4)',
      '    at async Promise.all (index 0)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
      '    at file:///app/x.mjs:1:1',
      '    at main (/app/x.ts:1:2',
      '    at /app/x.ts:1:2)',
    ].join('\n');

    expect(summarizeError(error, { stack: true })).toBe(
      [
        'Error',
        '    at Object.<anonymous> (/app/scripts/scheduled/x.ts:3:4)',
        '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
        '    at file:///app/x.mjs:1:1',
      ].join('\n')
    );
  });

  it('frame は上限の 10 行まで', () => {
    const error = new Error('x');
    error.stack = ['Error: x', ...Array.from({ length: 12 }, (_, i) => `    at f${i} (/app/x.ts:${i + 1}:1)`)].join('\n');

    expect(summarizeError(error, { stack: true }).split('\n')).toHaveLength(11);
  });

  it('要約の途中で例外が出たら、固定の文字列を返して外へ投げない', () => {
    const error = new Error(HOST);
    Object.defineProperty(error, 'name', {
      get() {
        throw new Error(HOST);
      },
    });

    expect(summarizeError(error)).toBe('Error (summary unavailable)');
  });
});
