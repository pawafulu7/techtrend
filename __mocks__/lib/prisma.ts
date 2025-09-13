// Prismaモックの定義
const prismaMock = {
  favorite: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  article: {
    findUnique: jest.fn(),
  },
  articleView: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  tag: {
    findMany: jest.fn(),
  },
  source: {
    findMany: jest.fn(),
  },
};

export const prisma = prismaMock;
export default prismaMock;