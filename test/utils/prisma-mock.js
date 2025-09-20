const { mockDeep, mockReset } = require('jest-mock-extended');

const prismaMock = mockDeep();

const resetPrismaMock = () => {
  mockReset(prismaMock);
};

module.exports = {
  prismaMock,
  resetPrismaMock,
};
