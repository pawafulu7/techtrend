/**
 * PID ファイルによる多重起動の防止
 *
 * 同じジョブが前回の実行中に重ねて起動されたとき、後から起動した方を終わらせる。
 * PID ファイルは排他的に作る（flag: 'wx'）ので、同時に起動しても取れるのは 1 つだけ。
 * PID ファイルが残っていても、そのプロセスが既に無ければ（異常終了の跡）作り直して続ける。
 */
import * as fs from 'fs';
import { summarizeError } from '@/lib/utils/sanitize-error';

export interface PidFileLock {
  /** ロックを取る。別のプロセスが実行中なら false */
  acquire(): boolean;
  /** 自分が取ったロックだけを外す */
  release(): void;
  /** 終了時と SIGINT・SIGTERM でロックを外す */
  releaseOnExit(): void;
}

export function createPidFileLock(pidFile: string, jobName: string): PidFileLock {
  /** PID ファイルを排他的に作る（既にあれば false）。存在の確認と作成を 1 回の操作で行う */
  function tryCreate(): boolean {
    try {
      fs.writeFileSync(pidFile, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  }

  function readPid(): number {
    try {
      return parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    } catch {
      return NaN;
    }
  }

  function acquire(): boolean {
    if (!tryCreate()) {
      const oldPid = readPid();
      if (!isNaN(oldPid)) {
        try {
          // Signal 0 checks if process exists without sending actual signal
          process.kill(oldPid, 0);
          console.error(`[WARN] ${jobName} already running (PID: ${oldPid}), exiting`);
          return false;
        } catch {
          // Process doesn't exist, stale PID file
          console.error(`[INFO] Removing stale PID file (old PID: ${oldPid})`);
        }
      }
      // 残っていた PID ファイルを消して、もう一度排他的に作る。
      // 同時に起動した別のプロセスが先に作っていれば、こちらは取らない
      fs.rmSync(pidFile, { force: true });
      if (!tryCreate()) {
        console.error(`[WARN] ${jobName} already running (PID: ${readPid()}), exiting`);
        return false;
      }
    }

    console.error(`[INFO] Lock acquired (PID: ${process.pid})`);
    return true;
  }

  function release(): void {
    try {
      if (fs.existsSync(pidFile)) {
        const storedPidStr = fs.readFileSync(pidFile, 'utf-8').trim();
        const storedPid = parseInt(storedPidStr, 10);

        // Only remove if this process owns the lock
        if (storedPid === process.pid) {
          fs.unlinkSync(pidFile);
          console.error(`[INFO] Lock released (PID: ${process.pid})`);
        }
      }
    } catch (error) {
      // Cleanup failure is not fatal
      console.error(`[WARN] Failed to release lock: ${summarizeError(error)}`);
    }
  }

  function releaseOnExit(): void {
    const cleanup = (signal: string, exitCode: number) => {
      console.error(`[INFO] Received ${signal}, cleaning up...`);
      release();
      process.exit(exitCode);
    };

    process.on('exit', release);
    process.on('SIGINT', () => cleanup('SIGINT', 130));
    process.on('SIGTERM', () => cleanup('SIGTERM', 143));
  }

  return { acquire, release, releaseOnExit };
}
