import type { PrismaClient } from '@/lib/prisma-exports';
import {
  SCHEMA_ARTIFACT_SQL,
  DUPLICATE_INDEX_SQL,
} from '@/lib/database/schema-catalog';
import {
  requiredIndexErrors,
  type SchemaArtifact,
} from '@/lib/database/schema-integrity';
import { NextRequest } from 'next/server';

const { PrismaClient: RealPrismaClient } = jest.requireActual(
  '@/lib/prisma-exports'
);
const { PrismaPg } = jest.requireActual('@prisma/adapter-pg');
let mockDb: PrismaClient;
let mockUserId: string;
let mockMissPrecheck = false;
let mockConstraintError: { code?: string } | undefined;

// Reuse the global Prisma facade because jest.setup imports it before test-local factories.
// Only HTTP/auth dependencies are mocked; delegated queries and the transaction use the real DB.
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (fn: unknown) => fn,
}));
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_type: unknown, fn: unknown) => fn,
}));

import { auth } from '@/lib/auth/auth';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

import { POST } from '@/app/api/user/source-presets/route';

const url = process.env.DATABASE_URL;
const describeDb =
  url && /_test$/.test(new URL(url).pathname) ? describe : describe.skip;

describeDb('schema integrity and functional UNIQUE (real test DB)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let sourceId: string;
  let tagId: string;

  beforeAll(async () => {
    mockDb = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
      log: [],
    });
    mockUserId = (
      await mockDb.user.create({
        data: { email: `schema-${suffix}@example.test` },
      })
    ).id;
    sourceId = (
      await mockDb.source.create({
        data: {
          name: `Schema ${suffix}`,
          type: 'RSS',
          url: `https://example.test/${suffix}`,
        },
      })
    ).id;
  });

  beforeEach(() => {
    (auth.api.getSession as jest.Mock).mockResolvedValue({
      user: { id: mockUserId },
      session: { id: 'schema-test-session' },
    });
    prismaMock.user.findUnique.mockImplementation((args: unknown) =>
      mockDb.user.findUnique(args as never)
    );
    prismaMock.source.findMany.mockImplementation((args: unknown) =>
      mockDb.source.findMany(args as never)
    );
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        try {
          return await mockDb.$transaction((tx) =>
            fn(
              new Proxy(tx, {
                get: (target, prop) => {
                  if (prop === 'userSourcePreset' && mockMissPrecheck)
                    return new Proxy(target.userSourcePreset, {
                      get: (model, method) =>
                        method === 'findFirst'
                          ? async () => null
                          : Reflect.get(model, method),
                    });
                  return Reflect.get(target, prop);
                },
              })
            )
          );
        } catch (error) {
          mockConstraintError = error as { code?: string };
          throw error;
        }
      }
    );
    mockConstraintError = undefined;
  });

  afterAll(async () => {
    if (!mockDb) return;
    if (mockUserId) await mockDb.user.delete({ where: { id: mockUserId } });
    if (sourceId) await mockDb.source.delete({ where: { id: sourceId } });
    if (tagId) await mockDb.tag.delete({ where: { id: tagId } });
    await mockDb.$disconnect();
  });

  it('preserves expression/partial HNSW and UNIQUE definitions, with no duplicate Article/Tag/Session indexes', async () => {
    const rows =
      await mockDb.$queryRawUnsafe<SchemaArtifact[]>(SCHEMA_ARTIFACT_SQL);
    expect(requiredIndexErrors(rows)).toEqual([]);
    expect(await mockDb.$queryRawUnsafe(DUPLICATE_INDEX_SQL)).toEqual([]);
  });

  it('lower(name) prevents case-only duplicate tags', async () => {
    const name = `SchemaTag-${suffix}`;
    tagId = (await mockDb.tag.create({ data: { name } })).id;
    await expect(
      mockDb.tag.create({ data: { name: name.toLowerCase() } })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('returns HTTP 409 for an actual functional UNIQUE violation after a missed preflight check', async () => {
    const name = `SchemaPreset-${suffix}`;
    // The newly accurate PSL default also allows the field to be omitted as in SQL.
    await mockDb.userSourcePreset.create({
      data: { userId: mockUserId, name },
    });
    mockMissPrecheck = true; // Simulate another request inserting after the name preflight check.
    try {
      const response = await POST(
        new NextRequest('http://localhost:3000/api/user/source-presets', {
          method: 'POST',
          body: JSON.stringify({
            name: name.toLowerCase(),
            sourceIds: [sourceId],
          }),
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 409,
        body: { error: 'Preset name already exists' },
      });
      expect(mockConstraintError?.code).toBe('P2002');
    } finally {
      mockMissPrecheck = false;
    }
  });
});
