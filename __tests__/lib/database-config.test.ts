/**
 * @jest-environment node
 *
 * getPoolConfig（lib/database-config.ts）。env は最初にプロパティを読んだときに環境変数を読むので、
 * 環境変数を変えるテストは、モジュールを読み直し、変えたまま getPoolConfig を呼ぶ
 */

const DB_URL = 'postgresql://user:pass@db.example.com:5432/app';

function withPoolConfig<T>(
  envOverrides: Record<string, string | undefined>,
  run: (
    getPoolConfig: typeof import('@/lib/database-config').getPoolConfig
  ) => T
): T {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(envOverrides)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    let result!: T;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      result = run(require('@/lib/database-config').getPoolConfig);
    });
    return result;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('getPoolConfig', () => {
  it('使っていない接続は既定で 60 秒保つ（画面を行き来する間に接続し直さないため）', () => {
    const idle = withPoolConfig(
      { DB_IDLE_TIMEOUT: undefined },
      (getPoolConfig) => getPoolConfig(DB_URL)?.idleTimeoutMillis
    );

    expect(idle).toBe(60_000);
  });

  it('DB_IDLE_TIMEOUT（秒）で変えられる', () => {
    const idle = withPoolConfig(
      { DB_IDLE_TIMEOUT: '15' },
      (getPoolConfig) => getPoolConfig(DB_URL)?.idleTimeoutMillis
    );

    expect(idle).toBe(15_000);
  });

  it('接続先が無ければ undefined（ビルド時）', () => {
    const config = withPoolConfig({ DATABASE_URL: undefined }, (getPoolConfig) =>
      getPoolConfig()
    );

    expect(config).toBeUndefined();
  });
});
