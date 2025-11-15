import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyFilter } from '@/app/components/source-filters/company-filter';
import type { CompanySource } from '@/lib/providers/company-source';

const mockSources: CompanySource[] = [
  { id: 'cyberagent', name: 'CyberAgent', isActive: true },
  { id: 'dena', name: 'DeNA', isActive: true },
  { id: 'layerx', name: 'LayerX', isActive: true },
  { id: 'mercari', name: 'Mercari', isActive: true },
  { id: 'repro', name: 'Repro', isActive: true },
];

const mockVisibleSources = mockSources.slice(0, 3); // Max 7, but using 3 for testing

describe('CompanyFilter', () => {
  const mockOnSearchChange = jest.fn();
  const mockOnSourceToggle = jest.fn();
  const mockOnBatchSelect = jest.fn();
  const mockOnExpandedChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render collapsed by default', () => {
      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
        />
      );

      expect(screen.getByTestId('company-filter-trigger')).toBeInTheDocument();
      expect(screen.getByText('企業ブログ')).toBeInTheDocument();
      expect(screen.getByText(`(0/${mockSources.length})`)).toBeInTheDocument();
      expect(screen.queryByTestId('company-filter-content')).not.toBeInTheDocument();
    });

    it('should show selection count', () => {
      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={['cyberagent', 'dena']}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
        />
      );

      expect(screen.getByText(`(2/${mockSources.length})`)).toBeInTheDocument();
    });

    it('should count only company blog sources in selection', () => {
      // selectedSourceIds includes non-company sources (41 total)
      const allSelectedIds = [
        'cyberagent',
        'dena',
        'layerx',
        'foreign-source-1', // Not in mockSources
        'foreign-source-2', // Not in mockSources
        'domestic-source-1', // Not in mockSources
      ];

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={allSelectedIds}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
        />
      );

      // Should count only 3 company sources (cyberagent, dena, layerx)
      expect(screen.getByText(`(3/${mockSources.length})`)).toBeInTheDocument();
    });
  });

  describe('expansion', () => {
    it('should expand when trigger clicked', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
        />
      );

      const trigger = screen.getByTestId('company-filter-trigger');
      await user.click(trigger);

      expect(screen.getByTestId('company-filter-content')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('企業名で検索...')).toBeInTheDocument();
    });

    it('should collapse when trigger clicked again', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
        />
      );

      const trigger = screen.getByTestId('company-filter-trigger');

      // Expand
      await user.click(trigger);
      expect(screen.getByTestId('company-filter-content')).toBeInTheDocument();

      // Collapse
      await user.click(trigger);
      expect(screen.queryByTestId('company-filter-content')).not.toBeInTheDocument();
    });

    it('should call onExpandedChange when controlled', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={false}
          onExpandedChange={mockOnExpandedChange}
        />
      );

      const trigger = screen.getByTestId('company-filter-trigger');
      await user.click(trigger);

      expect(mockOnExpandedChange).toHaveBeenCalledWith(true);
    });
  });

  describe('search functionality', () => {
    it('should display visible sources', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      // Only visible sources (first 3) should be displayed
      expect(screen.getByText('CyberAgent')).toBeInTheDocument();
      expect(screen.getByText('DeNA')).toBeInTheDocument();
      expect(screen.getByText('LayerX')).toBeInTheDocument();
      expect(screen.queryByText('Mercari')).not.toBeInTheDocument();
      expect(screen.queryByText('Repro')).not.toBeInTheDocument();
    });

    it('should call onSearchChange when typing', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      const searchInput = screen.getByPlaceholderText('企業名で検索...');
      await user.type(searchInput, 'Cyber');

      expect(mockOnSearchChange).toHaveBeenCalled();
    });

    it('should show empty state when no visible sources', () => {
      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={[]}
          selectedSourceIds={[]}
          searchValue="XYZ"
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      expect(screen.getByText('該当企業がありません')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('should call onSourceToggle when checkbox clicked', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      const checkbox = screen.getByRole('checkbox', { name: /CyberAgent/i });
      await user.click(checkbox);

      expect(mockOnSourceToggle).toHaveBeenCalledWith('cyberagent');
    });

    it('should call onSourceToggle when CommandItem clicked', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      const item = screen.getByTestId('company-item-cyberagent');
      await user.click(item);

      expect(mockOnSourceToggle).toHaveBeenCalledWith('cyberagent');
    });

    it('should highlight checked items', () => {
      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={['cyberagent', 'dena']}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      const cyberCheckbox = screen.getByRole('checkbox', { name: /CyberAgent/i });
      const deNACheckbox = screen.getByRole('checkbox', { name: /DeNA/i });
      const layerXCheckbox = screen.getByRole('checkbox', { name: /LayerX/i });

      expect(cyberCheckbox).toBeChecked();
      expect(deNACheckbox).toBeChecked();
      expect(layerXCheckbox).not.toBeChecked();
    });
  });

  describe('modal dialog', () => {
    it('should open dialog when "すべて管理..." clicked', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={[]}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      const manageButton = screen.getByTestId('company-filter-manage-all');
      await user.click(manageButton);

      // Dialog should be rendered
      expect(screen.getByText('企業ブログを選択')).toBeInTheDocument();
    });

    it('should call onBatchSelect when dialog applies selection', async () => {
      const user = userEvent.setup();

      render(
        <CompanyFilter
          sources={mockSources}
          visibleSources={mockVisibleSources}
          selectedSourceIds={['cyberagent']}
          searchValue=""
          onSearchChange={mockOnSearchChange}
          onSourceToggle={mockOnSourceToggle}
          onBatchSelect={mockOnBatchSelect}
          isExpanded={true}
        />
      );

      // Open dialog
      const manageButton = screen.getByTestId('company-filter-manage-all');
      await user.click(manageButton);

      // Select all in dialog
      const selectAllButton = screen.getByText('すべて選択');
      await user.click(selectAllButton);

      // Apply
      const applyButton = screen.getByText('適用');
      await user.click(applyButton);

      expect(mockOnBatchSelect).toHaveBeenCalledWith(mockSources.map((s) => s.id));
    });
  });
});
