/**
 * manage-summaries.ts Script Integration Tests
 * Tests script execution, command dispatch, and error handling
 */

import { SummaryManager } from '@/lib/services/summary-manager';
import { getPrismaClient } from '@/lib/cli/utils/database';

// Mocks
jest.mock('@/lib/services/summary-manager');
jest.mock('@/lib/cli/utils/database');

describe('manage-summaries script', () => {
  let mockPrisma: any;
  let mockManager: any;
  let originalExitCode: number | undefined;
  let originalArgv: string[];

  beforeEach(() => {
    // Store originals
    originalExitCode = process.exitCode;
    originalArgv = process.argv;

    // Reset exitCode
    process.exitCode = undefined;

    // Clear mocks
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
      generateMissingSummaries: jest.fn().mockResolvedValue({ generated: 3, errors: 0 }),
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
    // Restore
    process.exitCode = originalExitCode;
    process.argv = originalArgv;
  });

  describe('generate command', () => {
    it('should execute successfully with default options', async () => {
      process.argv = ['node', 'script.ts', 'generate'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(SummaryManager).toHaveBeenCalledWith(mockPrisma);
      expect(mockManager.generateSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'generate' })
      );
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined(); // Success
    });

    it('should exit with code 1 on error', async () => {
      process.argv = ['node', 'script.ts', 'generate'];
      mockManager.generateSummaries.mockRejectedValue(new Error('API error'));

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(process.exitCode).toBe(1);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('should pass source option correctly', async () => {
      process.argv = ['node', 'script.ts', 'generate', '--source', 'Zenn'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockManager.generateSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'Zenn' })
      );
    });

    it('should parse limit option correctly', async () => {
      process.argv = ['node', 'script.ts', 'generate', '--limit', '100'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockManager.generateSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });
  });

  describe('regenerate command', () => {
    it('should execute successfully', async () => {
      process.argv = ['node', 'script.ts', 'regenerate'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockManager.regenerateSummaries).toHaveBeenCalled();
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it('should pass force flag correctly', async () => {
      process.argv = ['node', 'script.ts', 'regenerate', '--force'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockManager.regenerateSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ force: true })
      );
    });
  });

  describe('missing command', () => {
    it('should execute successfully', async () => {
      process.argv = ['node', 'script.ts', 'missing'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockManager.generateMissingSummaries).toHaveBeenCalled();
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it('should pass days option correctly', async () => {
      process.argv = ['node', 'script.ts', 'missing', '--days', '14'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockManager.generateMissingSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ days: 14 })
      );
    });
  });

  describe('unknown command handling', () => {
    it('should exit with code 1 for unknown command', async () => {
      process.argv = ['node', 'script.ts', 'unknown'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockManager.generateSummaries).not.toHaveBeenCalled();
      expect(mockManager.regenerateSummaries).not.toHaveBeenCalled();
      expect(mockManager.generateMissingSummaries).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(mockPrisma.$disconnect).toHaveBeenCalled(); // finally block
    });
  });

  describe('prisma.$disconnect() guarantee', () => {
    it('should call $disconnect even on error', async () => {
      process.argv = ['node', 'script.ts', 'generate'];
      mockManager.generateSummaries.mockRejectedValue(new Error('Fatal error'));

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('should call $disconnect on unknown command', async () => {
      process.argv = ['node', 'script.ts', 'invalid'];

      const { main } = await import('@/scripts/scheduled/manage-summaries');
      await main();

      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });
});
