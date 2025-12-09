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
    expect(screen.getByText('50%')).toBeInTheDocument();
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
    expect(screen.getByText(/Bio, Website, Twitter/)).toBeInTheDocument();
  });

  it('hides incomplete fields hint when isLowCompletion is false', () => {
    render(
      <ProfileCompletionBar
        {...defaultProps}
        isLowCompletion={false}
      />
    );
    // When isLowCompletion is false, incomplete fields should not show
    expect(screen.queryByText(/Bio, Website, Twitter/)).not.toBeInTheDocument();
  });

  it('shows truncated incomplete fields with count when more than 3', () => {
    render(
      <ProfileCompletionBar
        {...defaultProps}
        incompleteFields={['Bio', 'Website', 'Twitter', 'GitHub', 'Profile image']}
      />
    );
    expect(screen.getByText(/Bio, Website, Twitter/)).toBeInTheDocument();
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
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
    expect(screen.getByText('100%')).toBeInTheDocument();
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
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ProfileCompletionBar {...defaultProps} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders light variant by default', () => {
    const { container } = render(<ProfileCompletionBar {...defaultProps} />);
    expect(container.firstChild).toHaveClass('bg-muted/30');
  });

  it('renders dark variant when specified', () => {
    const { container } = render(
      <ProfileCompletionBar {...defaultProps} variant="dark" />
    );
    expect(container.firstChild).toHaveClass('bg-white/5');
  });
});
