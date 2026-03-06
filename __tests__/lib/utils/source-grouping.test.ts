import { groupSourcesByGroupId } from '@/lib/utils/source/source-grouping';
import { prisma } from '@/lib/database';

// Mock Prisma
jest.mock('@/lib/database', () => ({
  prisma: {
    sourceGroup: {
      findMany: jest.fn(),
    },
  },
}));

describe('groupSourcesByGroupId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty array when no sources have groupId', async () => {
    const sources = [
      { id: 'source1', name: 'Source 1', groupId: null },
      { id: 'source2', name: 'Source 2', groupId: undefined },
    ];

    const result = await groupSourcesByGroupId(sources);

    expect(result).toEqual([]);
    expect(prisma.sourceGroup.findMany).not.toHaveBeenCalled();
  });

  it('should group sources by groupId', async () => {
    const sources = [
      { id: 'source1', name: 'Source 1', groupId: 'group1' },
      { id: 'source2', name: 'Source 2', groupId: 'group1' },
      { id: 'source3', name: 'Source 3', groupId: 'group2' },
    ];

    const mockGroups = [
      { id: 'group1', name: 'Group 1', type: 'company_blog', ordering: 1 },
      { id: 'group2', name: 'Group 2', type: 'community', ordering: 2 },
    ];

    (prisma.sourceGroup.findMany as jest.Mock).mockResolvedValue(mockGroups);

    const result = await groupSourcesByGroupId(sources);

    expect(result).toHaveLength(2);
    expect(result[0].group).toEqual({
      id: 'group1',
      name: 'Group 1',
      type: 'company_blog',
      ordering: 1,
    });
    expect(result[0].sources).toEqual([
      { id: 'source1', name: 'Source 1' },
      { id: 'source2', name: 'Source 2' },
    ]);
    expect(result[1].sources).toEqual([{ id: 'source3', name: 'Source 3' }]);
  });

  it('should filter out empty groups', async () => {
    const sources = [
      { id: 'source1', name: 'Source 1', groupId: 'group1' },
    ];

    const mockGroups = [
      { id: 'group1', name: 'Group 1', type: 'company_blog', ordering: 1 },
      { id: 'group2', name: 'Group 2', type: 'community', ordering: 2 },
    ];

    (prisma.sourceGroup.findMany as jest.Mock).mockResolvedValue(mockGroups);

    const result = await groupSourcesByGroupId(sources);

    expect(result).toHaveLength(1);
    expect(result[0].group.id).toBe('group1');
  });
});
