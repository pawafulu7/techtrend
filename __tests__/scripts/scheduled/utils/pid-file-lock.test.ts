/**
 * createPidFileLock: PID ファイルによる多重起動の防止
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createPidFileLock } from '@/scripts/scheduled/utils/pid-file-lock';

describe('createPidFileLock', () => {
  let dir: string;
  let pidFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-lock-'));
    pidFile = path.join(dir, 'job.pid');
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('PID ファイルが無ければロックを取り、自分の PID を書く', () => {
    const lock = createPidFileLock(pidFile, 'job');

    expect(lock.acquire()).toBe(true);
    expect(fs.readFileSync(pidFile, 'utf-8')).toBe(String(process.pid));
  });

  it('実行中のプロセスの PID が書かれていればロックを取らない', () => {
    // 自分自身は実行中なので、process.kill(pid, 0) が成功する
    fs.writeFileSync(pidFile, String(process.pid));
    const lock = createPidFileLock(pidFile, 'job');

    expect(lock.acquire()).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('job already running'));
  });

  it('残っている PID のプロセスが無ければ上書きしてロックを取る', () => {
    fs.writeFileSync(pidFile, '12345');
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    const lock = createPidFileLock(pidFile, 'job');

    expect(lock.acquire()).toBe(true);
    expect(fs.readFileSync(pidFile, 'utf-8')).toBe(String(process.pid));
  });

  it('中身の読めない PID ファイルは作り直してロックを取る', () => {
    fs.writeFileSync(pidFile, 'not-a-pid');
    const lock = createPidFileLock(pidFile, 'job');

    expect(lock.acquire()).toBe(true);
    expect(fs.readFileSync(pidFile, 'utf-8')).toBe(String(process.pid));
  });

  it('2 つ目のロックは、1 つ目が持っている間は取れない', () => {
    const first = createPidFileLock(pidFile, 'job');
    const second = createPidFileLock(pidFile, 'job');

    expect(first.acquire()).toBe(true);
    // 1 つ目のプロセス（= このプロセス）は実行中なので、2 つ目は取らない
    expect(second.acquire()).toBe(false);
  });

  it('release は自分の PID のときだけ PID ファイルを消す', () => {
    const lock = createPidFileLock(pidFile, 'job');

    fs.writeFileSync(pidFile, '12345');
    lock.release();
    expect(fs.existsSync(pidFile)).toBe(true);

    fs.writeFileSync(pidFile, String(process.pid));
    lock.release();
    expect(fs.existsSync(pidFile)).toBe(false);
  });
});
