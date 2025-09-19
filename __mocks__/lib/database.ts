// Re-export prisma mock from the main prisma mock
export { prisma } from './prisma';
export default require('./prisma').prisma;