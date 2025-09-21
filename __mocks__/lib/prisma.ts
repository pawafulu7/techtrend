// Prismaモック - test/utils/prisma-mock.jsを利用
const { prismaMock, resetPrismaMock } = require('../../test/utils/prisma-mock');

export const prisma = prismaMock;
export { resetPrismaMock };
export default prismaMock;