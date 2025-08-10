/**
 * Database mock for Jest testing
 * This file resolves the path mismatch between application code (@/lib/database)
 * and the original mock location (@/lib/prisma)
 */

// Import the existing Prisma mock
import { prismaMock } from '../prisma';

// Export as 'prisma' to match the actual module export
export const prisma = prismaMock;

// Also provide default export for compatibility
export default prismaMock;