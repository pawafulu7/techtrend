import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanySelectionDialog } from '@/app/components/source-filters/company-selection-dialog';
import type { CompanySource } from '@/lib/providers/company-source';

const mockSources: CompanySource[] = [
  { id: 'cyberagent', name: 'CyberAgent', isActive: true },
  { id: 'dena', name: 'DeNA', isActive: true },
  { id: 'layerx', name: 'LayerX', isActive: true },
  { id: 'mercari', name: 'Mercari', isActive: true },
  { id: 'repro', name: 'Repro', isActive: true },
];

describe('CompanySelectionDialog', () => {
  const mockOnOpenChange = jest.fn();
  const mockOnApply = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should not render when closed', () => {
      render(
        <CompanySelectionDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      expect(screen.queryByText('企業ブログを選択')).not.toBeInTheDocument();
    });

    it('should render when open', () => {
      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      expect(screen.getByText('企業ブログを選択')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('企業名で検索...')).toBeInTheDocument();
    });

    it('should display all sources in grid', () => {
      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      mockSources.forEach((source) => {
        expect(screen.getByText(source.name)).toBeInTheDocument();
      });
    });

    it('should show selection count', () => {
      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent', 'dena']}
          onApply={mockOnApply}
        />
      );

      expect(screen.getByText(`選択中: 2 / ${mockSources.length}`)).toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('should filter sources by search query', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      const searchInput = screen.getByPlaceholderText('企業名で検索...');

      await user.type(searchInput, 'Cyber');

      await waitFor(() => {
        expect(screen.getByText('CyberAgent')).toBeInTheDocument();
        expect(screen.queryByText('DeNA')).not.toBeInTheDocument();
        expect(screen.queryByText('Mercari')).not.toBeInTheDocument();
      });
    });

    it('should handle case-insensitive search', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      const searchInput = screen.getByPlaceholderText('企業名で検索...');

      await user.type(searchInput, 'layer');

      await waitFor(() => {
        expect(screen.getByText('LayerX')).toBeInTheDocument();
      });
    });

    it('should show empty state when no results', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      const searchInput = screen.getByPlaceholderText('企業名で検索...');

      await user.type(searchInput, 'XYZ999');

      await waitFor(() => {
        expect(screen.getByText('該当する企業が見つかりませんでした')).toBeInTheDocument();
      });
    });
  });

  describe('selection management', () => {
    it('should toggle source selection', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      const checkbox = screen.getByRole('checkbox', { name: /CyberAgent/i });

      await user.click(checkbox);

      expect(screen.getByText('選択中: 1 / 5')).toBeInTheDocument();
    });

    it('should select all sources', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      const selectAllButton = screen.getByText('すべて選択');
      await user.click(selectAllButton);

      expect(screen.getByText(`選択中: ${mockSources.length} / ${mockSources.length}`)).toBeInTheDocument();
    });

    it('should clear all selections', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent', 'dena']}
          onApply={mockOnApply}
        />
      );

      const clearButton = screen.getByText('クリア');
      await user.click(clearButton);

      expect(screen.getByText('選択中: 0 / 5')).toBeInTheDocument();
    });
  });

  describe('tempState synchronization', () => {
    it('should initialize tempSelected with selectedSources when opened', () => {
      const { rerender } = render(
        <CompanySelectionDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent', 'dena']}
          onApply={mockOnApply}
        />
      );

      rerender(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent', 'dena']}
          onApply={mockOnApply}
        />
      );

      expect(screen.getByText('選択中: 2 / 5')).toBeInTheDocument();
    });

    it('should reset tempSelected when dialog reopens', async () => {
      const user = userEvent.setup();

      const { rerender } = render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent']}
          onApply={mockOnApply}
        />
      );

      // User selects more items
      const deNACheckbox = screen.getByRole('checkbox', { name: /DeNA/i });
      await user.click(deNACheckbox);

      expect(screen.getByText('選択中: 2 / 5')).toBeInTheDocument();

      // Close and reopen
      rerender(
        <CompanySelectionDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent']}
          onApply={mockOnApply}
        />
      );

      rerender(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent']}
          onApply={mockOnApply}
        />
      );

      // Should reset to original (1 selected)
      expect(screen.getByText('選択中: 1 / 5')).toBeInTheDocument();
    });
  });

  describe('apply and cancel', () => {
    it('should call onApply with tempSelected when Apply clicked', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      // Select some sources
      const cyberCheckbox = screen.getByRole('checkbox', { name: /CyberAgent/i });
      const deNACheckbox = screen.getByRole('checkbox', { name: /DeNA/i });

      await user.click(cyberCheckbox);
      await user.click(deNACheckbox);

      // Apply
      const applyButton = screen.getByText('適用');
      await user.click(applyButton);

      expect(mockOnApply).toHaveBeenCalledWith(['cyberagent', 'dena']);
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should not call onApply when Cancel clicked', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent']}
          onApply={mockOnApply}
        />
      );

      // Select additional source
      const deNACheckbox = screen.getByRole('checkbox', { name: /DeNA/i });
      await user.click(deNACheckbox);

      // Cancel
      const cancelButton = screen.getByText('キャンセル');
      await user.click(cancelButton);

      expect(mockOnApply).not.toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should reset tempSelected when cancelled', async () => {
      const user = userEvent.setup();

      const { rerender } = render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent']}
          onApply={mockOnApply}
        />
      );

      // Select additional source
      const deNACheckbox = screen.getByRole('checkbox', { name: /DeNA/i });
      await user.click(deNACheckbox);

      expect(screen.getByText('選択中: 2 / 5')).toBeInTheDocument();

      // Cancel
      const cancelButton = screen.getByText('キャンセル');
      await user.click(cancelButton);

      // Reopen
      rerender(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent']}
          onApply={mockOnApply}
        />
      );

      // Should be reset to original
      expect(screen.getByText('選択中: 1 / 5')).toBeInTheDocument();
    });
  });

  describe('backdrop and escape', () => {
    it('should not call onApply when dialog closed via Escape key', async () => {
      const user = userEvent.setup();

      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={['cyberagent']}
          onApply={mockOnApply}
        />
      );

      // Select additional source
      const deNACheckbox = screen.getByRole('checkbox', { name: /DeNA/i });
      await user.click(deNACheckbox);

      expect(screen.getByText('選択中: 2 / 5')).toBeInTheDocument();

      mockOnOpenChange.mockClear();
      mockOnApply.mockClear();

      // Press Escape to close dialog
      await user.keyboard('{Escape}');

      expect(mockOnApply).not.toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('responsive grid', () => {
    it('should render grid with responsive classes', () => {
      render(
        <CompanySelectionDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sources={mockSources}
          selectedSources={[]}
          onApply={mockOnApply}
        />
      );

      const grid = screen.getByRole('list', { name: '企業一覧' }).firstChild;

      expect(grid).toHaveClass('grid');
      expect(grid).toHaveClass('grid-cols-1');
      expect(grid).toHaveClass('sm:grid-cols-2');
      expect(grid).toHaveClass('lg:grid-cols-3');
      expect(grid).toHaveClass('xl:grid-cols-4');
    });
  });
});
