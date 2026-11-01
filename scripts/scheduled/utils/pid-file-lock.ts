/**
 * PID ファイルによる多重起動の防止
 *
 * 同じジョブが前回の実行中に重ねて起動されたとき、後から起動した方を終わらせる。
 * PID ファイルが残っていても、そのプロセスが既に無ければ（異常終了の跡）上書きして続ける。
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
  function acquire(): boolean {
    if (fs.existsSync(pidFile)) {
      const oldPidStr = fs.readFileSync(pidFile, 'utf-8').trim();
      const oldPid = parseInt(oldPidStr, 10);

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
    }

    fs.writeFileSync(pidFile, process.pid.toString());
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
