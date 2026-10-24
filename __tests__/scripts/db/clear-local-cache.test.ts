/**
 * scripts/db/clear-local-cache.sh を、偽の docker コマンドで動かして確かめる
 * - コンテナの起動引数（--requirepass の次）から取ったパスワードを、引数ではなく環境変数 REDISCLI_AUTH で
 *   redis-cli に渡すこと
 * - 応答が OK のときだけ成功にすること、コンテナが止まっていれば何もしないこと
 */
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// リポジトリの直下からの相対パス（テストは直下で動く）
const SCRIPT = './scripts/db/clear-local-cache.sh';

// 呼ばれた引数と、exec のときの REDISCLI_AUTH（値と長さ）を記録する偽の docker。
// inspect は、起動状態か、起動引数の JSON（{{json .Config.Cmd}} の出力）を返す
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$1" in
  inspect)
    if [[ "$3" == *State.Running* ]]; then printf '%s\\n' "$FAKE_RUNNING"; else printf '%s\\n' "$FAKE_CMD_JSON"; fi ;;
  exec)
    printf 'auth=%s\\n' "\${REDISCLI_AUTH-<unset>}" >> "$FAKE_DOCKER_LOG"
    printf 'auth_length=%s\\n' "\${#REDISCLI_AUTH}" >> "$FAKE_DOCKER_LOG"
    printf '%s\\n' "$FAKE_REPLY" ;;
esac
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clear-local-cache-'));
  writeFileSync(join(dir, 'docker'), FAKE_DOCKER);
  chmodSync(join(dir, 'docker'), 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(fake: { running?: string; cmd?: string[] | null; reply?: string }) {
  const log = join(dir, 'docker.log');
  writeFileSync(log, '');
  const result = spawnSync('bash', [SCRIPT], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      FAKE_DOCKER_LOG: log,
      FAKE_RUNNING: fake.running ?? 'true',
      FAKE_CMD_JSON: JSON.stringify(fake.cmd === undefined ? ['redis-server'] : fake.cmd),
      FAKE_REPLY: fake.reply ?? 'OK',
    },
    encoding: 'utf8',
  });
  return { ...result, calls: readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}

describe('clear-local-cache.sh', () => {
  it('--requirepass の次の値を環境変数で渡して FLUSHDB を流し、値は引数にも画面にも出さない', () => {
    const result = run({
      cmd: ['redis-server', '--requirepass', 'example-password', '--maxmemory', '400mb'],
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('techtrend-redis の中身を消しました');
    expect(result.calls).toContain('exec -e REDISCLI_AUTH techtrend-redis redis-cli FLUSHDB');
    expect(result.calls).toContain('auth=example-password');
    const others = result.calls.filter((line) => !line.startsWith('auth='));
    expect(others.join('\n')).not.toContain('example-password');
    expect(result.stdout + result.stderr).not.toContain('example-password');
  });

  it('パスワードの末尾の改行も落とさずに渡す', () => {
    const result = run({ cmd: ['redis-server', '--requirepass', 'pass\n'] });

    expect(result.status).toBe(0);
    expect(result.calls).toContain('auth_length=5');
  });

  it.each([
    ['--requirepass が無い', ['redis-server', '--maxmemory', '400mb']],
    ['--requirepass の後に値が無い', ['redis-server', '--requirepass']],
    ['起動引数が無い（null）', null],
  ])('%sときは、パスワードを渡さずに流す', (_name, cmd) => {
    const result = run({ cmd });

    expect(result.status).toBe(0);
    expect(result.calls).toContain('exec techtrend-redis redis-cli FLUSHDB');
    expect(result.calls).toContain('auth=<unset>');
  });

  it('応答が OK でなければ失敗にする（redis-cli はエラーでも 0 で終わることがある）', () => {
    const result = run({
      cmd: ['redis-server', '--requirepass', 'example-password'],
      reply: 'NOAUTH Authentication required.',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('中身を消せませんでした: NOAUTH Authentication required.');
  });

  it('コンテナが起動していなければ、何も消さずに失敗にする', () => {
    const result = run({ running: 'false' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('techtrend-redis コンテナが起動していません');
    expect(result.calls.some((line) => line.startsWith('exec'))).toBe(false);
  });
});
