/**
 * Source を id で upsert する前に、同じ id の既存行が別の名前でないかを確かめる。
 *
 * upsert は既存行の name・url・type を書き換えるので、id を取り違えると、既存の記事が参照する
 * ソースが別のソースに変わる。createFetcher(row) は更新後の名前を見るので、この取り違えを検出できない。
 */
import type { Prisma } from '@/lib/prisma-exports';

/** 同じ id の行が別の名前で既にある（登録スクリプトの id の取り違え） */
export class SourceIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceIdentityError';
  }
}

export async function assertSourceIdentity(
  client: Pick<Prisma.TransactionClient, 'source'>,
  source: { id: string; name: string }
): Promise<void> {
  const existing = await client.source.findUnique({
    where: { id: source.id },
    select: { name: true },
  });
  if (existing && existing.name !== source.name) {
    throw new SourceIdentityError(
      `Source id "${source.id}" already belongs to "${existing.name}", not "${source.name}"`
    );
  }
}
