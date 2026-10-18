/**
 * ソースの取得で使うエラー
 */

/**
 * ソースの形式が変わり、人が見るべき失敗（例: ニュースレターの号はあるのに記事を1本も
 * 取り出せない）。収集のジョブはこれがあると失敗として終わり、通知を出す
 * （scripts/scheduled/utils/collect-failures.ts）。ネットワークの失敗など一時的なものには使わない
 */
export class SourceFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceFormatError';
  }
}
