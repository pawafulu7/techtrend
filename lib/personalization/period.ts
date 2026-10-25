/**
 * パーソナライズの期間（月数）の下限の日時。0 以下は期間なしで null を返す。
 * 1 か月は 30 日として数える
 */
export function getPeriodCutoffDate(
  periodMonths: number,
  now: number = Date.now()
): Date | null {
  return periodMonths > 0
    ? new Date(now - periodMonths * 30 * 24 * 60 * 60 * 1000)
    : null;
}
