/**
 * 登録スクリプトの id の取り違えを止める assertSourceIdentity のテスト
 */

import { assertSourceIdentity, SourceIdentityError } from '@/scripts/maintenance/utils/source-identity';
import type { Prisma } from '@/lib/prisma-exports';

function clientWith(existing: { name: string } | null) {
  const findUnique = jest.fn().mockResolvedValue(existing);
  return { client: { source: { findUnique } } as unknown as Pick<Prisma.TransactionClient, 'source'>, findUnique };
}

describe('assertSourceIdentity', () => {
  it('同じ id の行が無ければ通す（新規の登録）', async () => {
    const { client, findUnique } = clientWith(null);
    await expect(assertSourceIdentity(client, { id: 'javascript_weekly', name: 'JavaScript Weekly' })).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'javascript_weekly' }, select: { name: true } });
  });

  it('同じ id・同じ名前なら通す（再実行）', async () => {
    const { client } = clientWith({ name: 'JavaScript Weekly' });
    await expect(assertSourceIdentity(client, { id: 'javascript_weekly', name: 'JavaScript Weekly' })).resolves.toBeUndefined();
  });

  it('同じ id が別の名前の行なら SourceIdentityError（既存の行を書き換えない）', async () => {
    const { client } = clientWith({ name: 'Hacker News' });
    await expect(assertSourceIdentity(client, { id: 'hacker_news_202508', name: 'JavaScript Weekly' })).rejects.toBeInstanceOf(
      SourceIdentityError
    );
  });
});
