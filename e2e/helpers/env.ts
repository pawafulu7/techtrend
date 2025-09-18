/**
 * CI環境判定ユーティリティ
 */

/**
 * CI環境で実行されているかを判定
 */
export const isCI = ['1', 'true', 'yes'].includes(
  String(process.env.CI).toLowerCase()
);

/**
 * CI環境に応じたタイムアウト値を取得
 * @param defaultTimeout デフォルトのタイムアウト（ミリ秒）
 * @returns CI環境の場合は長めのタイムアウト、それ以外はデフォルト値
 */
export const getCITimeout = (defaultTimeout: number): number => {
  return isCI ? defaultTimeout * 2 : defaultTimeout;
};