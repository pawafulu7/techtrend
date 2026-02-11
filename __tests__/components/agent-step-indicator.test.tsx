import { render, screen } from '@testing-library/react';
import { AgentStepIndicator } from '@/app/search/agent/_components/agent-step-indicator';
import type { SearchStep } from '@/lib/hooks/useAgentSearch';

describe('AgentStepIndicator', () => {
  const renderIndicator = (step: SearchStep, isTimedOut = false) => {
    return render(
      <AgentStepIndicator currentStep={step} isTimedOut={isTimedOut} />
    );
  };

  describe('Step states', () => {
    test('shows all steps as pending when idle', () => {
      renderIndicator('idle');

      // Implementation has 3 steps: searching, analyzing, generating
      expect(screen.getByText('記事検索')).toBeInTheDocument();
      expect(screen.getByText('AI分析')).toBeInTheDocument();
      expect(screen.getByText('回答生成')).toBeInTheDocument();
    });

    test('shows searching step as active', () => {
      renderIndicator('searching');

      const stepIndicator = screen.getByTestId('agent-step-indicator');
      expect(stepIndicator).toBeInTheDocument();
    });

    test('shows analyzing step as active with searching complete', () => {
      renderIndicator('analyzing');

      const stepIndicator = screen.getByTestId('agent-step-indicator');
      expect(stepIndicator).toBeInTheDocument();
    });

    test('shows generating step as active with searching and analyzing complete', () => {
      renderIndicator('generating');

      const stepIndicator = screen.getByTestId('agent-step-indicator');
      expect(stepIndicator).toBeInTheDocument();
      // 'generating' is now a displayed step, so it should be active
      const activeStep = stepIndicator.querySelector('[aria-current="step"]');
      expect(activeStep).toBeInTheDocument();
      // Verify the generating step specifically is the active one
      const generatingLabel = screen.getByText('回答生成');
      const generatingStepContainer = generatingLabel.closest('.flex.flex-col');
      expect(
        generatingStepContainer?.querySelector('[aria-current="step"]')
      ).toBeInTheDocument();
    });

    test('shows all steps as complete when complete', () => {
      renderIndicator('complete');

      expect(screen.getByText('回答の生成が完了しました')).toBeInTheDocument();
    });

    test('shows error message when in error state', () => {
      renderIndicator('error');

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    });
  });

  describe('Timeout behavior', () => {
    test('shows timeout message when isTimedOut=true and not complete', () => {
      renderIndicator('analyzing', true);

      expect(
        screen.getByText('まだ処理中です...しばらくお待ちください')
      ).toBeInTheDocument();
    });

    test('does not show timeout message when complete', () => {
      renderIndicator('complete', true);

      expect(
        screen.queryByText('まだ処理中です...しばらくお待ちください')
      ).not.toBeInTheDocument();
    });

    test('does not show timeout message when error', () => {
      renderIndicator('error', true);

      expect(
        screen.queryByText('まだ処理中です...しばらくお待ちください')
      ).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('has status role and aria-live', () => {
      renderIndicator('searching');

      const indicator = screen.getByTestId('agent-step-indicator');
      expect(indicator).toHaveAttribute('role', 'status');
      expect(indicator).toHaveAttribute('aria-live', 'polite');
    });

    test('marks active step with aria-current', () => {
      renderIndicator('searching');

      const stepIndicator = screen.getByTestId('agent-step-indicator');
      const activeStep = stepIndicator.querySelector('[aria-current="step"]');
      expect(activeStep).toBeInTheDocument();
    });
  });
});
