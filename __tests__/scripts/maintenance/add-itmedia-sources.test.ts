/**
 * add-itmedia-sources.ts: id の取り違えがあれば、何も書かずに止める
 * （このスクリプトはトランザクションを使わないので、書きながら確かめると途中まで更新される）
 */

import { registerItmediaSources, ITMEDIA_SOURCES } from '@/scripts/maintenance/add-itmedia-sources';
import { SourceIdentityError } from '@/scripts/maintenance/utils/source-identity';
import type { Prisma } from '@/lib/prisma-exports';

function mockClient(existingNames: Array<string | null>) {
  const findUnique = jest.fn();
  existingNames.forEach((name) => findUnique.mockResolvedValueOnce(name === null ? null : { name }));
  const now = new Date();
  const upsert = jest.fn().mockResolvedValue({ createdAt: now, updatedAt: now });
  const client = { source: { findUnique, upsert } } as unknown as Pick<Prisma.TransactionClient, 'source'>;
  return { client, findUnique, upsert };
}

describe('registerItmediaSources', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('2件目の id が別の名前の行なら、1件目も書かずに止める', async () => {
    const { client, upsert } = mockClient([null, 'Another Source', null]);

    await expect(registerItmediaSources(client)).rejects.toBeInstanceOf(SourceIdentityError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('取り違えが無ければ、全部を登録する', async () => {
    const { client, upsert } = mockClient(ITMEDIA_SOURCES.map(() => null));

    await expect(registerItmediaSources(client)).resolves.toEqual({ added: ITMEDIA_SOURCES.length, updated: 0 });
    expect(upsert).toHaveBeenCalledTimes(ITMEDIA_SOURCES.length);
  });
});
