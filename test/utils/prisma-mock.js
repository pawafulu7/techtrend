const { mockDeep, mockReset, mockClear } = require('jest-mock-extended');

const prismaMock = mockDeep();

/**
 * デフォルトのユーザーモックを設定
 * validateUser() ミドルウェアが prisma.user.findUnique を呼び出すため、
 * 認証済みテストでユーザーが存在することを保証する
 */
const setupDefaultUserMock = () => {
  // シンプルなデフォルト値を設定（テストで上書き可能）
  // validateUser が期待する最小限のフィールドを返す
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'test-user-id',
    deletedAt: null,
  });
};

// デフォルトの$transactionモックを設定
const setupDefaultTransactionMock = () => {
  prismaMock.$transaction = jest.fn().mockImplementation(async (operations) => {
    if (typeof operations === 'function') {
      return operations(prismaMock);
    }
    return Promise.all(operations);
  });
};

// 初期設定
setupDefaultTransactionMock();
setupDefaultUserMock();

const resetPrismaMock = () => {
  // モックの呼び出し履歴と実装を完全にリセット
  mockReset(prismaMock);
  // デフォルトモックを再設定
  setupDefaultTransactionMock();
  setupDefaultUserMock();
};

module.exports = {
  prismaMock,
  resetPrismaMock,
};
