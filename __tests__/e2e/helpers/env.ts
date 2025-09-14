/**
 * E2Eテスト用の環境変数ユーティリティ
 */

/**
 * CI環境かどうかを判定
 * process.env.CIが '1', 'true', 'yes' のいずれかの場合にtrueを返す
 */
export const isCI = ['1', 'true', 'yes'].includes(String(process.env?.CI).toLowerCase());

/**
 * タイムアウト値を取得
 * @param level - タイムアウトレベル
 * @returns ミリ秒単位のタイムアウト値
 */
export function getTimeout(level: 'short' | 'medium' | 'long' | 'extraLong'): number {
  const timeouts = {
    short: 5000,
    medium: 10000,
    long: 30000,
    extraLong: 60000
  };

  // CI環境では長めのタイムアウトを設定
  if (isCI) {
    return timeouts[level] * 2;
  }

  return timeouts[level];
}

/**
 * 環境に応じたタイムアウトを取得
 * @param ciLevel - CI環境でのタイムアウトレベル
 * @param localLevel - ローカル環境でのタイムアウトレベル
 * @returns ミリ秒単位のタイムアウト値
 */
export function getEnvTimeout(
  ciLevel: 'short' | 'medium' | 'long' | 'extraLong',
  localLevel: 'short' | 'medium' | 'long' | 'extraLong'
): number {
  return isCI ? getTimeout(ciLevel) : getTimeout(localLevel);
}