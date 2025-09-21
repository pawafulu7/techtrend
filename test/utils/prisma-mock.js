const { mockDeep, mockReset, mockClear } = require('jest-mock-extended');

const prismaMock = mockDeep();

// デフォルトの$transactionモックを設定
prismaMock.$transaction = jest.fn().mockImplementation(async (operations) => {
  if (typeof operations === 'function') {
    return operations(prismaMock);
  }
  return Promise.all(operations);
});

const resetPrismaMock = () => {
  // モックの呼び出し履歴をクリア（実装は残す）
  mockClear(prismaMock);
  // $transactionモックを再設定
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
