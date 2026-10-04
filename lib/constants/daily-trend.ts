/**
 * 日次トレンドのレポートが無いときの error。サーバー（API と Server Component）が返し、
 * 画面はこれと比べて「まだ生成されていません」を出す（issue #701）。
 * 文言を変えると画面の判定が外れるため、ここで共有する。
 */
export const DAILY_REPORT_NOT_FOUND_ERROR = 'No report found for this date';
