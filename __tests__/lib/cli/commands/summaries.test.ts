/**
 * CLI Integration Tests for summaries command
 * Tests the integration between CLI and SummaryManager
 */

import { SummaryManager } from '@/lib/services/summary-manager';
import { getPrismaClient } from '@/lib/cli/utils/database';

// Mocks
jest.mock('@/lib/services/summary-manager');
jest.mock('@/lib/cli/utils/database');

describe('summaries CLI command', () => {
  let mockPrisma: any;
  let mockManager: any;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    // Reset modules to get fresh commander instance (CodexMCP)
    jest.resetModules();

    // Store and reset exitCode (CodexMCP)
    originalExitCode = process.exitCode;
    process.exitCode = undefined;

    // Clear all mocks (CodexMCP)
    jest.clearAllMocks();

    // Mock Prisma
    mockPrisma = {
      $disconnect: jest.fn().mockResolvedValue(undefined)
    };
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    // Mock SummaryManager
    mockManager = {
      generateSummaries: jest.fn().mockResolvedValue({ generated: 10, errors: 0 }),
      regenerateSummaries: jest.fn().mockResolvedValue({ generated: 5, errors: 0 }),
      getStats: jest.fn().mockReturnValue({
        attempts: 10,
        successes: 10,
        failures: 0,
        overloadErrors: 0,
        startTime: Date.now()
      })
    };
    (SummaryManager as jest.Mock).mockImplementation(() => mockManager);
  });

  afterEach(() => {
    // Restore exitCode (CodexMCP)
    process.exitCode = originalExitCode;
  });

  describe('generate command', () => {
    it('should exit with code 0 on success', async () => {
      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride(); // Prevent actual exit (CodexMCP)

      await summariesCommand.parseAsync(['node', 'techtrend', 'summaries', 'generate']);

      expect(SummaryManager).toHaveBeenCalledWith(mockPrisma);
      expect(mockManager.generateSummaries).toHaveBeenCalledWith({
        command: 'generate',
        source: undefined,
        limit: 100,
        batch: 10
      });
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined(); // Success: no exitCode set
    });

    it('should exit with code 1 when result has errors', async () => {
      mockManager.generateSummaries.mockResolvedValue({ generated: 5, errors: 3 });

      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync(['node', 'techtrend', 'summaries', 'generate']);

      expect(process.exitCode).toBe(1);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('should exit with code 1 when SummaryManager throws', async () => {
      mockManager.generateSummaries.mockRejectedValue(new Error('API error'));

      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync(['node', 'techtrend', 'summaries', 'generate']);

      expect(process.exitCode).toBe(1);
      expect(mockPrisma.$disconnect).toHaveBeenCalled(); // finally block
    });

    it('should validate parseInt and exit with code 1 for NaN', async () => {
      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync([
        'node',
        'techtrend',
        'summaries',
        'generate',
        '--limit',
        'invalid'
      ]);

      expect(mockManager.generateSummaries).not.toHaveBeenCalled(); // Stopped early (CodexMCP)
      expect(process.exitCode).toBe(1);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('should pass source option to SummaryManager', async () => {
      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync([
        'node',
        'techtrend',
        'summaries',
        'generate',
        '--source',
        'Zenn'
      ]);

      expect(mockManager.generateSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'Zenn' })
      );
    });
  });

  describe('regenerate command', () => {
    it('should exit with code 0 on success', async () => {
      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync(['node', 'techtrend', 'summaries', 'regenerate']);

      expect(SummaryManager).toHaveBeenCalledWith(mockPrisma);
      expect(mockManager.regenerateSummaries).toHaveBeenCalledWith({
        command: 'regenerate',
        source: undefined,
        days: 7,
        force: undefined,
        batch: 10
      });
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it('should exit with code 1 when SummaryManager throws', async () => {
      mockManager.regenerateSummaries.mockRejectedValue(new Error('DB error'));

      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync(['node', 'techtrend', 'summaries', 'regenerate']);

      expect(process.exitCode).toBe(1);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('should pass force and batch options', async () => {
      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync([
        'node',
        'techtrend',
        'summaries',
        'regenerate',
        '--force',
        '--batch',
        '20'
      ]);

      expect(mockManager.regenerateSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ force: true, batch: 20 })
      );
    });
  });

  describe('check command', () => {
    it('should disconnect prisma in finally block', async () => {
      const { summariesCommand } = await import('@/lib/cli/commands/summaries');
      summariesCommand.exitOverride();

      await summariesCommand.parseAsync(['node', 'techtrend', 'summaries', 'check']);

      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });
});
