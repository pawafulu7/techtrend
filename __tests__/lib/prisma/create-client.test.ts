/**
 * withPrismaErrorLogSetting が、PRISMA_ERROR_LOG=false のときだけ Prisma の error ログを外すこと
 *
 * Prisma の error ログには、DB に繋がらないときの接続先（ホスト）が入る。定期実行の公開ログでは外す
 */
import { resetEnvCache } from '@/lib/config/env';
import { withPrismaErrorLogSetting } from '@/lib/prisma/create-client';

describe('withPrismaErrorLogSetting', () => {
  const original = process.env.PRISMA_ERROR_LOG;

  afterEach(() => {
    if (original === undefined) delete process.env.PRISMA_ERROR_LOG;
    else process.env.PRISMA_ERROR_LOG = original;
    resetEnvCache();
  });

  it.each([
    ['false なら error を外す', 'false', ['warn']],
    ['true なら変えない', 'true', ['error', 'warn']],
    ['未設定なら変えない', undefined, ['error', 'warn']],
  ])('%s', (_name, value, expected) => {
    if (value === undefined) delete process.env.PRISMA_ERROR_LOG;
    else process.env.PRISMA_ERROR_LOG = value;
    resetEnvCache();

    expect(withPrismaErrorLogSetting(['error', 'warn'])).toEqual(expected);
  });
});
