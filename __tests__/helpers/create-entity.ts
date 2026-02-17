import { TechEntity, TechEntityType } from '@prisma/client';

/**
 * Create a TechEntity test fixture with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function createEntity(overrides: Partial<TechEntity> = {}): TechEntity {
  return {
    id: 'test-entity-1',
    name: 'React',
    type: TechEntityType.FRAMEWORK,
    aliases: [],
    description: null,
    firstSeenAt: null,
    lastSeenAt: null,
    mentionCount: 10,
    externalIds: { npm: 'react' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
