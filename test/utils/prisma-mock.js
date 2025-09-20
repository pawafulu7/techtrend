const { mockDeep, mockReset } = require('jest-mock-extended');

const prismaMock = mockDeep();

// デフォルトの$transactionモックを設定
prismaMock.$transaction = jest.fn().mockImplementation(async (operations) => {
  if (typeof operations === 'function') {
    return operations(prismaMock);
  }
  return Promise.all(operations);
});

const resetPrismaMock = () => {
  mockReset(prismaMock);
  // $transactionモックも再設定
  prismaMock.$transaction = jest.fn().mockImplementation(async (operations) => {
    if (typeof operations === 'function') {
      return operations(prismaMock);
    }
    return Promise.all(operations);
  });
};

module.exports = {
  prismaMock,
  resetPrismaMock,
};
