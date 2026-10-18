/**
 * ニュースレターの号から取り出した記事の形
 */

export interface ExtractedItem {
  /** 編集者が付けた見出し（HTML を落とした文字列） */
  title: string;
  /** 号の本文の中のリンク。Cooperpress は自誌の転送 URL */
  href: string;
  /** 欄の名前（Cooperpress）。欄の無い形式は空文字 */
  section: string;
}

export interface ExtractionResult {
  /** 記事として取り出したもの */
  items: ExtractedItem[];
  /** 除外した本数（理由ごと。欄で除いたものは `section:<欄の名前>`） */
  excluded: Record<string, number>;
}

/** 除外の前の本数（記事として取り出せる形のものの数） */
export function countCandidates(result: ExtractionResult): number {
  return result.items.length + Object.values(result.excluded).reduce((sum, n) => sum + n, 0);
}

export function addExcluded(excluded: Record<string, number>, reason: string): void {
  excluded[reason] = (excluded[reason] ?? 0) + 1;
}
