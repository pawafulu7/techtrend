import { render, screen } from '@testing-library/react';
import { ProfileCompletionBar } from '@/components/profile/ProfileCompletionBar';

describe('ProfileCompletionBar', () => {
  const defaultProps = {
    percentage: 50,
    message: 'Good start',
    isLowCompletion: true,
    incompleteFields: ['Bio', 'Website', 'Twitter'],
  };

  it('renders percentage correctly', () => {
    render(<ProfileCompletionBar {...defaultProps} />);
    expect(screen.getByText('Profile 50%')).toBeInTheDocument();
  });

  it('renders message correctly', () => {
    render(<ProfileCompletionBar {...defaultProps} />);
    expect(screen.getByText('Good start')).toBeInTheDocument();
  });

  it('renders progress bar with correct aria attributes', () => {
    render(<ProfileCompletionBar {...defaultProps} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    expect(progressBar).toHaveAttribute('aria-label', 'Profile completion: 50%');
  });

  it('shows incomplete fields hint when isLowCompletion is true', () => {
    render(<ProfileCompletionBar {...defaultProps} />);
    expect(screen.getByText(/Add: Bio, Website, Twitter/)).toBeInTheDocument();
  });

  it('hides incomplete fields hint when isLowCompletion is false', () => {
    render(
      <ProfileCompletionBar
        {...defaultProps}
        isLowCompletion={false}
      />
    );
    expect(screen.queryByText(/Add:/)).not.toBeInTheDocument();
  });

  it('shows truncated incomplete fields with count when more than 3', () => {
    render(
      <ProfileCompletionBar
        {...defaultProps}
        incompleteFields={['Bio', 'Website', 'Twitter', 'GitHub', 'Profile image']}
      />
    );
    expect(screen.getByText(/Add: Bio, Website, Twitter/)).toBeInTheDocument();
    expect(screen.getByText(/\+2 more/)).toBeInTheDocument();
  });

  it('renders with 100% completion', () => {
    render(
      <ProfileCompletionBar
        percentage={100}
        message="Complete!"
        isLowCompletion={false}
        incompleteFields={[]}
      />
    );
    expect(screen.getByText('Profile 100%')).toBeInTheDocument();
    expect(screen.getByText('Complete!')).toBeInTheDocument();
  });

  it('renders with 0% completion', () => {
    render(
      <ProfileCompletionBar
        percentage={0}
        message="Get started"
        isLowCompletion={true}
        incompleteFields={['Display name', 'Bio', 'Profile image']}
      />
    );
    expect(screen.getByText('Profile 0%')).toBeInTheDocument();
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ProfileCompletionBar {...defaultProps} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('applies low completion background style', () => {
    const { container } = render(<ProfileCompletionBar {...defaultProps} />);
    expect(container.firstChild).toHaveClass('bg-muted/50');
  });

  it('does not apply low completion background when completion is high', () => {
    const { container } = render(
      <ProfileCompletionBar {...defaultProps} isLowCompletion={false} />
    );
    expect(container.firstChild).not.toHaveClass('bg-muted/50');
  });
});
