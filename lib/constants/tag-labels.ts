/** 表示・検索用の辞書。DB の正式名やカテゴリ判定のキーは変更しない。 */
export const TAG_LABELS: Record<
  string,
  { displayName: string; aliases: readonly string[] }
> = {
  Cybersecurity: {
    displayName: 'サイバーセキュリティ',
    aliases: ['サイバーセキュリティ'],
  },
  'Law Enforcement': { displayName: '法執行', aliases: ['法執行', '捜査機関'] },
  'Machine Learning': { displayName: '機械学習', aliases: ['機械学習'] },
  'Deep Learning': {
    displayName: '深層学習',
    aliases: ['深層学習', 'ディープラーニング'],
  },
  'Artificial Intelligence': { displayName: '人工知能', aliases: ['人工知能'] },
  'Data Science': {
    displayName: 'データサイエンス',
    aliases: ['データサイエンス'],
  },
  'Computer Vision': {
    displayName: 'コンピュータビジョン',
    aliases: ['コンピュータビジョン'],
  },
  'Natural Language Processing': {
    displayName: '自然言語処理',
    aliases: ['自然言語処理'],
  },
  Security: { displayName: 'セキュリティ', aliases: ['セキュリティ'] },
  Privacy: { displayName: 'プライバシー', aliases: ['プライバシー'] },
  Vulnerability: { displayName: '脆弱性', aliases: ['脆弱性'] },
  Authentication: { displayName: '認証', aliases: ['認証'] },
  Authorization: { displayName: '認可', aliases: ['認可'] },
  Monitoring: { displayName: '監視', aliases: ['監視', 'モニタリング'] },
  Observability: {
    displayName: '可観測性',
    aliases: ['可観測性', 'オブザーバビリティ'],
  },
  'Cloud Computing': {
    displayName: 'クラウドコンピューティング',
    aliases: ['クラウドコンピューティング'],
  },
};

export function getTagDisplayName(name: string): string {
  const entry = Object.entries(TAG_LABELS).find(
    ([canonical]) => canonical.toLowerCase() === name.toLowerCase()
  );
  return entry?.[1].displayName ?? name;
}

/** 別名に一致する正式名を足す。日本語の正式名が既にある場合も検索対象に残す。 */
export function expandTagSearchNames(names: string[]): string[] {
  return Array.from(
    new Set(
      names.flatMap((name) => [
        name,
        ...Object.entries(TAG_LABELS)
          .filter(([, label]) =>
            label.aliases.some(
              (alias) => alias.toLowerCase() === name.toLowerCase()
            )
          )
          .map(([canonical]) => canonical),
      ])
    )
  );
}

export function findTagNamesByAlias(query: string): string[] {
  if (!query.trim()) return [];
  return Object.entries(TAG_LABELS)
    .filter(([, label]) =>
      label.aliases.some((alias) =>
        alias.toLowerCase().includes(query.toLowerCase())
      )
    )
    .map(([canonical]) => canonical);
}
