// Keep the real Pino serializers and capture the JSON that production would write.
jest.mock('pino', () => {
  const pino = jest.requireActual('pino');
  const lines: string[] = [];
  return {
    __esModule: true,
    default: (options: unknown) =>
      pino(options, { write: (line: string) => lines.push(line) }),
    __lines: lines,
  };
});

describe('production error logging', () => {
  let logger: typeof import('@/lib/logger').default;
  let createLogger: typeof import('@/lib/logger').createLogger;
  const lines: string[] = jest.requireMock('pino').__lines;
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    JEST_WORKER_ID: process.env.JEST_WORKER_ID,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.JEST_WORKER_ID;
    process.env.LOG_LEVEL = 'trace';
    lines.length = 0;
    jest.isolateModules(() => {
      const module = require('@/lib/logger');
      logger = module.default;
      createLogger = module.createLogger;
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.each(['error', 'warn', 'info', 'debug', 'trace', 'fatal'] as const)(
    'preserves Error.message with the err key at %s level',
    (level) => {
      const error = Object.assign(new Error('boom-message'), { code: 'P2010' });
      logger[level]({ err: error, articleId: 'article-1' }, 'Operation failed');

      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        level: level.toUpperCase(),
        articleId: 'article-1',
        err: { name: 'Error', message: 'boom-message' },
        msg: 'Operation failed',
      });
      expect(JSON.parse(lines[0]).err).not.toHaveProperty('stack');
    }
  );

  it('sanitizes credentials in the message of a contextual logger', () => {
    const child = createLogger('article-api');
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
    child.error(
      { err: new Error(`Request failed: ${secret}`) },
      'Fetch failed'
    );

    expect(JSON.parse(lines[0])).toMatchObject({
      context: 'article-api',
      err: { name: 'Error', message: 'Request failed: [REDACTED:API_KEY]' },
    });
    expect(lines[0]).not.toContain(secret);
    expect(JSON.parse(lines[0]).err).not.toHaveProperty('stack');
  });

  it('preserves already sanitized error objects', () => {
    logger.error(
      { err: { name: 'TypeError', message: 'Sanitized failure' } },
      'Failed'
    );
    expect(JSON.parse(lines[0]).err).toEqual({
      name: 'TypeError',
      message: 'Sanitized failure',
    });
  });
});
