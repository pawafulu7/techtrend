'use client';

import { Sparkles } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { cn } from '@/lib/utils';

interface AgentRelatedQuestionsProps {
  /** Related questions to display (3-5 recommended) */
  questions: string[];
  /** Callback when a question is selected */
  onSelectQuestion: (question: string) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays related questions as clickable chips.
 * Clicking a question prefills the search bar without executing the search.
 */
export function AgentRelatedQuestions({
  questions,
  onSelectQuestion,
  isLoading = false,
  className,
}: AgentRelatedQuestionsProps) {
  if (isLoading) {
    return (
      <CardV2
        variant="ghost"
        className={cn('mt-6 p-4 min-h-[100px] flex items-center justify-center', className)}
        data-testid="related-questions-loading"
      >
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full border-2 border-[var(--tt-color-primary)] border-t-transparent animate-spin" />
          <span className="text-sm text-[var(--tt-color-text-muted)]">
            関連する質問を読み込み中...
          </span>
        </div>
      </CardV2>
    );
  }

  if (questions.length === 0) return null;

  return (
    <section
      className={className}
      aria-labelledby="related-questions-heading"
      data-testid="agent-related-questions"
    >
      <CardV2 variant="ghost" className="mt-6 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[var(--tt-color-primary)]" aria-hidden="true" />
          <h3
            id="related-questions-heading"
            className="text-sm font-medium text-[var(--tt-color-text)]"
          >
            関連する質問
          </h3>
        </div>

        <div role="list" className="flex flex-wrap gap-2 md:gap-3">
          {questions.map((question, index) => (
            <ButtonV2
              key={`${question}-${index}`}
              variant="outline"
              size="sm"
              onClick={() => onSelectQuestion(question)}
              className={cn(
                'text-sm px-4 py-3 md:py-2',
                'w-full sm:w-auto text-left',
                'hover:border-[var(--tt-color-primary)] hover:bg-[var(--tt-color-primary)]/5',
                'transition-colors'
              )}
              role="listitem"
              aria-label={`関連質問: ${question}`}
              data-testid="related-question-chip"
            >
              {question}
            </ButtonV2>
          ))}
        </div>
      </CardV2>
    </section>
  );
}

/**
 * Generate related questions based on AI response and articles.
 * Phase 1: Static keyword-based generation
 * Phase 2: Will be replaced with AI-generated questions
 */
export function generateRelatedQuestions(
  response: string,
  _articles?: Array<{ title: string }>,
  maxQuestions = 5
): string[] {
  // Extract potential keywords from response
  const techKeywords = [
    'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js',
    'Python', 'Go', 'Rust', 'Docker', 'Kubernetes',
    'AWS', 'GCP', 'Azure', 'Terraform', 'CI/CD',
    'GraphQL', 'REST API', 'PostgreSQL', 'MongoDB', 'Redis',
    'AI', 'LLM', 'ChatGPT', 'Claude', 'OpenAI',
    'セキュリティ', 'パフォーマンス', 'テスト', 'アーキテクチャ',
  ];

  // Find keywords mentioned in the response
  const foundKeywords = techKeywords.filter(keyword =>
    response.toLowerCase().includes(keyword.toLowerCase())
  );

  // Question templates
  const templates = [
    (keyword: string) => `${keyword}の最新のベストプラクティスは？`,
    (keyword: string) => `${keyword}を使った実装例を教えて`,
    (keyword: string) => `${keyword}と他の技術の比較`,
    (keyword: string) => `${keyword}の入門記事`,
    (keyword: string) => `${keyword}のトラブルシューティング`,
  ];

  const questions: string[] = [];

  // Generate questions from found keywords
  for (let i = 0; i < Math.min(foundKeywords.length, maxQuestions); i++) {
    const keyword = foundKeywords[i];
    const template = templates[i % templates.length];
    questions.push(template(keyword));
  }

  // If not enough questions, add generic ones
  const genericQuestions = [
    '最近のトレンド技術について教えて',
    'フロントエンド開発のおすすめ記事',
    'バックエンド開発のベストプラクティス',
    'DevOps関連の最新情報',
    'AI/ML関連の記事を探して',
  ];

  while (questions.length < maxQuestions) {
    const generic = genericQuestions[questions.length % genericQuestions.length];
    if (!questions.includes(generic)) {
      questions.push(generic);
    } else {
      break;
    }
  }

  return questions.slice(0, maxQuestions);
}
