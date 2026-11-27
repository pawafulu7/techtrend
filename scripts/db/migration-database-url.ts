/**
 * Prisma CLI（prisma.config.ts）が繋ぐ DB の URL を決める。
 *
 * Vercel の本番のビルドの `prisma migrate deploy` だけ、管理者のロール（MIGRATION_DATABASE_URL）で流す。
 * アプリの実行時の DATABASE_URL は表の読み書きだけのロールで、表を作ったり変えたりできないため。
 * package.json の vercel-build が、そのコマンドにだけ USE_MIGRATION_DATABASE_URL=1 を付ける（prisma generate などの
 * ほかの CLI や、手元・テストで、何かの拍子に MIGRATION_DATABASE_URL が入っていても管理者で繋がないように）。
 * 本番のビルドで MIGRATION_DATABASE_URL が無いときは、DATABASE_URL に戻らず、DB に繋ぐ前に止める（切り替えの途中は
 * DATABASE_URL に古い管理者の URL が残っていて、戻ると管理者でマイグレーションが確定してしまうため）
 */
export function migrationDatabaseUrl(
  env: Record<string, string | undefined>
): string | undefined {
  if (env.USE_MIGRATION_DATABASE_URL === '1' && env.VERCEL_ENV === 'production') {
    if (!env.MIGRATION_DATABASE_URL) {
      throw new Error(
        'MIGRATION_DATABASE_URL is required for migrations in a Vercel production build (docs/operations/deployment.md)'
      );
    }
    return env.MIGRATION_DATABASE_URL;
  }
  return env.DATABASE_URL;
}
