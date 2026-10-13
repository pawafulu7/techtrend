import { CommanderError, type Command } from 'commander';
import { closeRedisConnection } from '@/lib/redis/client';
import { closePrismaClient } from './utils/database';
import { logger } from './utils/logger';

/**
 * CLI を実行し、プロセスを終了させるべき終了コードを返す。
 * 正常終了では undefined を返し、各 action が設定した process.exitCode に任せる。
 */
export async function runCli(
  program: Command,
  argv?: readonly string[]
): Promise<number | undefined> {
  program.exitOverride();

  try {
    await program.parseAsync(argv);
    return undefined;
  } catch (error) {
    // ヘルプ・版の表示も CommanderError（exitCode: 0）として投げられる。
    // commander がメッセージを出力済みなので、ここでは終了コードだけを使う
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    logger.error('コマンドの実行に失敗しました', error);
    return 1;
  } finally {
    // DB と Redis の接続が残ると、コマンドの完了後もプロセスが終わらないので閉じる。
    // Redis は、コマンドが読み込むキャッシュのモジュールが読み込んだ時点で接続している
    await closeConnection('DB', closePrismaClient);
    await closeConnection('Redis', closeRedisConnection);
  }
}

async function closeConnection(
  name: string,
  close: () => Promise<void>
): Promise<void> {
  try {
    await close();
  } catch (error) {
    logger.error(`${name} の接続を閉じられませんでした`, error);
  }
}
