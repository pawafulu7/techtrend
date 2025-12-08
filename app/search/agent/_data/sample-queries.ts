export interface SampleQuery {
  readonly id: string;
  readonly text: string;
  readonly category: 'infrastructure' | 'ai' | 'frontend' | 'backend' | 'security';
}

export const SAMPLE_QUERIES: readonly SampleQuery[] = [
  { id: 'q1', text: 'AWS最新機能アップデート速報', category: 'infrastructure' },
  { id: 'q2', text: 'Kubernetes運用自動化術', category: 'infrastructure' },
  { id: 'q3', text: 'JavaScript性能最適化術', category: 'frontend' },
  { id: 'q4', text: 'Next.js×React最新UI', category: 'frontend' },
  { id: 'q5', text: 'Python高速API実装入門', category: 'backend' },
  { id: 'q6', text: 'Goマイクロサービス設計実践術', category: 'backend' },
  { id: 'q7', text: 'AIエージェント実用事例集2024', category: 'ai' },
  { id: 'q8', text: 'LLM調整ChatGPT応用術', category: 'ai' },
  { id: 'q9', text: 'Web脆弱性最新トレンド追跡術', category: 'security' },
  { id: 'q10', text: 'ゼロトラスト侵入検知強化実践', category: 'security' },
] as const;

export const CATEGORY_LABELS: Record<SampleQuery['category'], string> = {
  infrastructure: 'インフラ',
  ai: 'AI',
  frontend: 'フロントエンド',
  backend: 'バックエンド',
  security: 'セキュリティ',
};

export const CATEGORY_ORDER: SampleQuery['category'][] = [
  'infrastructure',
  'ai',
  'frontend',
  'backend',
  'security',
];
