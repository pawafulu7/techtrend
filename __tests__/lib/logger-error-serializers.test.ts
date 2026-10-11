/**
 * createErrorSerializers が、LOG_ERROR_DETAILS=false のときだけ例外の message をログに出さないこと
 *
 * 定期実行のログは公開リポジトリの GitHub Actions に残り、DB に繋がらないときの message には
 * 接続先が入る。実際の pino に serializer を渡し、書き出された JSON に接続先が無いことを確かめる
 */
import pino from 'pino';
import { Writable } from 'stream';
import { createErrorLogHooks, createErrorSerializers } from '@/lib/logger';

const HOST = 'db.example.com';

function createTestLogger(logErrorDetails: string | undefined, lines: string[]) {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const hooks = createErrorLogHooks(logErrorDetails);
  return pino(
    { serializers: createErrorSerializers(logErrorDetails), ...(hooks ? { hooks } : {}) },
    stream
  );
}

function logWith(logErrorDetails: string | undefined, fields: Record<string, unknown>): string {
  const lines: string[] = [];
  createTestLogger(logErrorDetails, lines).error(fields, 'failed');
  return lines.join('');
}

function connectionError(): Error {
  return Object.assign(
    new Error(`Can't reach database server at \`${HOST}:5432\``),
    {
      code: 'P1001',
    }
  );
}

describe('createErrorSerializers', () => {
  it('false なら err を種類とコードだけにする', () => {
    const output = logWith('false', { err: connectionError() });

    expect(JSON.parse(output).err).toBe('Error code=P1001');
    expect(output).not.toContain(HOST);
  });

  it('false なら errorMessage・error の文字列は中身を出さず、error の例外は要約する', () => {
    const output = logWith('false', {
      errorMessage: `connect ECONNREFUSED ${HOST}:5432`,
      error: connectionError(),
      jobId: 'job-1',
    });
    const parsed = JSON.parse(output);

    expect(parsed.errorMessage).toBe('[omitted]');
    expect(parsed.error).toBe('Error code=P1001');
    expect(parsed.jobId).toBe('job-1');
    expect(output).not.toContain(HOST);
  });

  it('child ロガーにも効く', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    pino({ serializers: createErrorSerializers('false') }, stream)
      .child({ context: 'worker' })
      .error({ err: connectionError() }, 'failed');

    expect(lines.join('')).not.toContain(HOST);
  });

  it.each([
    ['未設定', undefined],
    ['true', 'true'],
  ])('%s なら従来どおり message を出す', (_name, value) => {
    const output = logWith(value, {
      err: connectionError(),
      errorMessage: 'kept',
    });
    const parsed = JSON.parse(output);

    expect(parsed.err.message).toContain(HOST);
    expect(parsed.errorMessage).toBe('kept');
  });

  it('本文の無い呼び出しでも、pino が例外の message を msg に写さない', () => {
    const lines: string[] = [];
    const logger = createTestLogger('false', lines);
    logger.error(connectionError());
    logger.error({ err: connectionError() });
    logger.error({ err: connectionError(), jobId: 'job-1' }, 'kept message');

    const output = lines.join('');
    expect(output).not.toContain(HOST);
    expect(lines.map((line) => JSON.parse(line).msg)).toEqual([
      'Error code=P1001',
      'Error code=P1001',
      'kept message',
    ]);
  });

  it('値の前後の空白と大文字小文字は無視する（env.ts と同じ）', () => {
    const output = logWith(' FALSE ', { err: connectionError() });

    expect(output).not.toContain(HOST);
  });

  it('未設定なら hook を付けない', () => {
    expect(createErrorLogHooks(undefined)).toBeUndefined();
  });
});
