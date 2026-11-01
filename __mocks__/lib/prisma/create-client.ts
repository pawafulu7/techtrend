// Mock for lib/prisma/create-client - returns the shared prismaMock
const { prismaMock } = require('../../../__tests__/helpers/prisma-mock');

export function createPrismaClient() {
  return prismaMock;
}
