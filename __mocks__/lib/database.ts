const { prismaMock, resetPrismaMock } = require('../../test/utils/prisma-mock');

module.exports = {
  prisma: prismaMock,
  default: prismaMock,
  resetPrismaMock,
};
