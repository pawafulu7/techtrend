// データベースモック - prisma-mockを利用
const { prismaMock, resetPrismaMock } = require('../../test/utils/prisma-mock');

export const prisma = prismaMock;
export { resetPrismaMock };
export default prismaMock;