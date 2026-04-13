// Mock for lib/prisma/create-client - returns the shared prismaMock
const { prismaMock } = require('../../../test/utils/prisma-mock');

export function createPrismaClient() {
  return prismaMock;
}
