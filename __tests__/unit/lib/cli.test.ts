import { Command } from 'commander';
import { runCli } from '@/lib/cli/run';
import { closePrismaClient } from '@/lib/cli/utils/database';
import { closeRedisConnection } from '@/lib/redis/client';

// next/jest の SWC は '@/...' の import を相対パスに書き換えるので、moduleNameMapper の
// モック（__mocks__/lib/redis/client.ts）は使われない。実装ファイルを相対パスでモックする。
// utils/database も、実際の DB に接続しないようにモックする
jest.mock('../../../lib/redis/client', () => ({
  closeRedisConnection: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/cli/utils/database', () => ({
  closePrismaClient: jest.fn().mockResolvedValue(undefined),
}));

const mockedCloseRedisConnection = jest.mocked(closeRedisConnection);
const mockedClosePrismaClient = jest.mocked(closePrismaClient);

describe('runCli', () => {
  let output: string[];

  const createProgram = () => {
    output = [];
    const program = new Command()
      .name('techtrend')
      .version('1.0.0')
      .configureOutput({
        writeOut: (str) => output.push(str),
        writeErr: (str) => output.push(str),
      });
    program.command('ok').action(async () => {});
    program.command('fail').action(async () => {
      throw new Error('action failed');
    });
    return program;
  };

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedCloseRedisConnection.mockClear();
    mockedClosePrismaClient.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('--help はヘルプを表示して終了コード 0 を返す', async () => {
    const exitCode = await runCli(createProgram(), ['node', 'techtrend', '--help']);

    expect(exitCode).toBe(0);
    expect(output.join('')).toContain('Usage: techtrend');
  });

  it('--version は版を表示して終了コード 0 を返す', async () => {
    const exitCode = await runCli(createProgram(), ['node', 'techtrend', '--version']);

    expect(exitCode).toBe(0);
    expect(output.join('')).toContain('1.0.0');
  });

  it('未知のコマンドは終了コード 1 を返す', async () => {
    const exitCode = await runCli(createProgram(), ['node', 'techtrend', 'unknown']);

    expect(exitCode).toBe(1);
    expect(output.join('')).toContain("unknown command 'unknown'");
  });

  it('async の action が成功したら終了コードを返さない', async () => {
    const exitCode = await runCli(createProgram(), ['node', 'techtrend', 'ok']);

    expect(exitCode).toBeUndefined();
  });

  it('async の action が reject したらエラーを出力して終了コード 1 を返す', async () => {
    const exitCode = await runCli(createProgram(), ['node', 'techtrend', 'fail']);

    expect(exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('action failed'));
  });

  it.each([
    ['action の成功', 'ok'],
    ['action の失敗', 'fail'],
    ['ヘルプの表示', '--help'],
  ])('%s の後に DB と Redis の接続を閉じる', async (_label, arg) => {
    await runCli(createProgram(), ['node', 'techtrend', arg]);

    expect(mockedClosePrismaClient).toHaveBeenCalledTimes(1);
    expect(mockedCloseRedisConnection).toHaveBeenCalledTimes(1);
  });

  it('DB の接続を閉じられなくても、Redis の接続を閉じてコマンドの終了コードを返す', async () => {
    mockedClosePrismaClient.mockRejectedValueOnce(new Error('disconnect failed'));

    const exitCode = await runCli(createProgram(), ['node', 'techtrend', '--version']);

    expect(exitCode).toBe(0);
    expect(mockedCloseRedisConnection).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('disconnect failed'));
  });

  it('Redis の接続を閉じられなくても、コマンドの終了コードを返す', async () => {
    mockedCloseRedisConnection.mockRejectedValueOnce(new Error('quit failed'));

    const exitCode = await runCli(createProgram(), ['node', 'techtrend', '--version']);

    expect(exitCode).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('quit failed'));
  });
});

describe('CLIコマンドの単体テスト', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // プロセス終了を防ぐ
  });

  it('正しいコマンド構造を持つ', () => {
    program
      .name('techtrend')
      .description('TechTrend management CLI')
      .version('1.0.0');

    expect(program.name()).toBe('techtrend');
    expect(program.description()).toBe('TechTrend management CLI');
  });

  it('サブコマンドを正しく登録する', () => {
    const feedCommand = new Command('feed')
      .description('フィード管理コマンド');
    
    const summaryCommand = new Command('summary')
      .description('要約管理コマンド');
    
    program.addCommand(feedCommand);
    program.addCommand(summaryCommand);

    const commands = program.commands.map(cmd => cmd.name());
    expect(commands).toContain('feed');
    expect(commands).toContain('summary');
  });

  it('オプションを正しく解析する', () => {
    program
      .option('-s, --source <source>', 'ソース指定')
      .option('-l, --limit <limit>', '件数制限', '10')
      .allowUnknownOption(); // 不明なオプションを許可

    program.parse(['--source', 'Qiita', '--limit', '20'], { from: 'user' });

    const opts = program.opts();
    expect(opts.source).toBe('Qiita');
    expect(opts.limit).toBe('20');
  });
});