// Prismaモック - __tests__/helpers/prisma-mock.jsを利用
const { prismaMock, resetPrismaMock } = require('../../__tests__/helpers/prisma-mock');

export const prisma = prismaMock;
export { resetPrismaMock };
export default prismaMock;