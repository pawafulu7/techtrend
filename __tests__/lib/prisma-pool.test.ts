/**
 * @jest-environment node
 *
 * lib/prisma.ts のプール。Vercel の Fluid compute で、一時停止の前にアイドルの接続を閉じるため、
 * 作った pg の Pool を attachDatabasePool に渡し、同じ Pool を PrismaPg に渡す
 * （`@/lib/prisma` は jest の設定でモックに差し替わるので、実物を相対パスで読む）
 */

const mockPoolInstances: unknown[] = [];
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(function (this: unknown, config) {
    Object.assign(this as object, { options: config });
    mockPoolInstances.push(this);
  }),
}));

const mockAttachDatabasePool = jest.fn();
jest.mock('@vercel/functions', () => ({
  attachDatabasePool: (...args: unknown[]) => mockAttachDatabasePool(...args),
}));

const mockPrismaPg = jest.fn();
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation((...args: unknown[]) => {
    mockPrismaPg(...args);
    return {};
  }),
}));

describe('lib/prisma のプール', () => {
  beforeEach(() => {
    mockPoolInstances.length = 0;
    mockAttachDatabasePool.mockClear();
    mockPrismaPg.mockClear();
    delete (globalThis as { __prisma?: unknown }).__prisma;
  });

  afterAll(() => {
    delete (globalThis as { __prisma?: unknown }).__prisma;
  });

  const loadPrismaModule = () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../lib/prisma');
    });
  };

  it('作った Pool を attachDatabasePool と PrismaPg の両方に渡す', () => {
    loadPrismaModule();

    expect(mockPoolInstances).toHaveLength(1);
    const [pool] = mockPoolInstances;
    expect(mockAttachDatabasePool).toHaveBeenCalledTimes(1);
    expect(mockAttachDatabasePool).toHaveBeenCalledWith(pool);
    expect(mockPrismaPg).toHaveBeenCalledWith(pool);
  });

  it('プールのアイドル時間は getPoolConfig の値（attachDatabasePool はこの時間だけ関数を起こしておく）', () => {
    loadPrismaModule();

    const [pool] = mockPoolInstances as Array<{
      options: { idleTimeoutMillis: number };
    }>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPoolConfig } = require('@/lib/database-config');
    const expected = getPoolConfig()?.idleTimeoutMillis ?? 10_000;
    expect(pool.options.idleTimeoutMillis).toBe(expected);
  });
});
