import { render, screen, fireEvent } from '@testing-library/react';
import {
  AgentRelatedQuestions,
  generateRelatedQuestions,
} from '@/app/search/agent/_components/agent-related-questions';

describe('AgentRelatedQuestions', () => {
  const mockOnSelectQuestion = jest.fn();
  const sampleQuestions = [
    'Reactの最新のベストプラクティスは？',
    'Next.jsを使った実装例を教えて',
    'TypeScriptと他の技術の比較',
  ];

  beforeEach(() => {
    mockOnSelectQuestion.mockClear();
  });

  test('renders related questions section with heading', () => {
    render(
      <AgentRelatedQuestions
        questions={sampleQuestions}
        onSelectQuestion={mockOnSelectQuestion}
      />
    );

    expect(screen.getByText('関連する質問')).toBeInTheDocument();
    expect(screen.getByTestId('agent-related-questions')).toBeInTheDocument();
  });

  test('renders all question chips', () => {
    render(
      <AgentRelatedQuestions
        questions={sampleQuestions}
        onSelectQuestion={mockOnSelectQuestion}
      />
    );

    sampleQuestions.forEach((question) => {
      expect(screen.getByText(question)).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('related-question-chip')).toHaveLength(3);
  });

  test('calls onSelectQuestion when a question chip is clicked', () => {
    render(
      <AgentRelatedQuestions
        questions={sampleQuestions}
        onSelectQuestion={mockOnSelectQuestion}
      />
    );

    const firstChip = screen.getByText(sampleQuestions[0]);
    fireEvent.click(firstChip);

    expect(mockOnSelectQuestion).toHaveBeenCalledWith(sampleQuestions[0]);
    expect(mockOnSelectQuestion).toHaveBeenCalledTimes(1);
  });

  test('renders nothing when questions array is empty', () => {
    const { container } = render(
      <AgentRelatedQuestions
        questions={[]}
        onSelectQuestion={mockOnSelectQuestion}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  test('shows loading state when isLoading=true', () => {
    render(
      <AgentRelatedQuestions
        questions={[]}
        onSelectQuestion={mockOnSelectQuestion}
        isLoading={true}
      />
    );

    expect(screen.getByTestId('related-questions-loading')).toBeInTheDocument();
    expect(screen.getByText('関連する質問を読み込み中...')).toBeInTheDocument();
  });

  test('hides loading state and shows questions when isLoading=false', () => {
    render(
      <AgentRelatedQuestions
        questions={sampleQuestions}
        onSelectQuestion={mockOnSelectQuestion}
        isLoading={false}
      />
    );

    expect(screen.queryByTestId('related-questions-loading')).not.toBeInTheDocument();
    expect(screen.getByText(sampleQuestions[0])).toBeInTheDocument();
  });

  test('applies custom className', () => {
    render(
      <AgentRelatedQuestions
        questions={sampleQuestions}
        onSelectQuestion={mockOnSelectQuestion}
        className="custom-class"
      />
    );

    expect(screen.getByTestId('agent-related-questions')).toHaveClass('custom-class');
  });

  test('question chips have proper accessibility attributes', () => {
    render(
      <AgentRelatedQuestions
        questions={sampleQuestions}
        onSelectQuestion={mockOnSelectQuestion}
      />
    );

    const chips = screen.getAllByTestId('related-question-chip');
    chips.forEach((chip, index) => {
      expect(chip).toHaveAttribute('role', 'listitem');
      expect(chip).toHaveAttribute('aria-label', `関連質問: ${sampleQuestions[index]}`);
    });
  });
});

describe('generateRelatedQuestions', () => {
  test('generates questions based on keywords in response', () => {
    const response = 'This article explains React hooks and TypeScript patterns.';
    const questions = generateRelatedQuestions(response);

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(5);
    // Should contain React or TypeScript related questions
    expect(questions.some(q => q.includes('React') || q.includes('TypeScript'))).toBe(true);
  });

  test('returns generic questions when no keywords found', () => {
    const response = 'Some general text without any technology keywords.';
    const questions = generateRelatedQuestions(response);

    expect(questions.length).toBe(5);
    // Should contain generic questions
    expect(questions.some(q => q.includes('トレンド') || q.includes('おすすめ'))).toBe(true);
  });

  test('respects maxQuestions parameter', () => {
    const response = 'React, TypeScript, Node.js, Docker, Kubernetes are all mentioned.';
    const questions = generateRelatedQuestions(response, undefined, 3);

    expect(questions).toHaveLength(3);
  });

  test('handles empty response', () => {
    const questions = generateRelatedQuestions('');

    expect(questions.length).toBe(5);
    // Should return generic questions
    expect(questions[0]).toBeTruthy();
  });

  test('extracts multiple keywords and generates varied questions', () => {
    const response = 'Using React with Next.js and TypeScript for modern web development.';
    const questions = generateRelatedQuestions(response);

    // Should have questions about different technologies
    const hasReact = questions.some(q => q.includes('React'));
    const hasNextjs = questions.some(q => q.includes('Next.js'));
    const hasTypeScript = questions.some(q => q.includes('TypeScript'));

    expect(hasReact || hasNextjs || hasTypeScript).toBe(true);
  });
});
