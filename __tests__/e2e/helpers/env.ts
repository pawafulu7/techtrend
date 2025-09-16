/**
 * E2Eテスト用の環境変数ユーティリティ
 */

import { getTimeout as getWaitUtilsTimeout, isRunningInCI } from '../../../e2e/helpers/wait-utils';

/**
 * CI環境かどうかを判定
 * process.env.CIが '1', 'true', 'yes' のいずれかの場合にtrueを返す
 */
export const isCI = isRunningInCI();

/**
 * wait-utils のタイムアウト定義をそのまま再エクスポート
 */
export const getTimeout = getWaitUtilsTimeout;

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
