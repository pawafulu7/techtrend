export interface SampleQuery {
  readonly id: string;
  readonly text: string;
  readonly category: 'infrastructure' | 'ai' | 'frontend' | 'backend' | 'security';
}

export const SAMPLE_QUERIES: readonly SampleQuery[] = [
  { id: 'q1', text: 'Terraformで始めるIaCのベストプラクティスを教えて', category: 'infrastructure' },
  { id: 'q2', text: '生成AIカスタマーサポートの成功事例をまとめて', category: 'ai' },
  { id: 'q3', text: 'Next.js 15の新機能を3分で把握したい', category: 'frontend' },
  { id: 'q4', text: 'React Server Componentsの注意点を教えて', category: 'frontend' },
  { id: 'q5', text: 'KubernetesのPod起動が遅いときの調査方法は？', category: 'infrastructure' },
  { id: 'q6', text: 'Rustで高パフォーマンスAPIを作る際の設計指針', category: 'backend' },
  { id: 'q7', text: '生成AIセキュリティの最新動向を知りたい', category: 'security' },
  { id: 'q8', text: 'フロントエンド監視(Sentry/Playwright)の導入手順', category: 'frontend' },
  { id: 'q9', text: 'LLMエージェントのプロダクション運用チェックリスト', category: 'ai' },
  { id: 'q10', text: 'PostgreSQLで時系列データを扱う最適化方法', category: 'backend' },
] as const;

export const CATEGORY_LABELS: Record<SampleQuery['category'], string> = {
  infrastructure: 'インフラ',
  ai: 'AI',
  frontend: 'フロントエンド',
  backend: 'バックエンド',
  security: 'セキュリティ',
};
