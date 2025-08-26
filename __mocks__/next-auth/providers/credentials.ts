import { jest } from '@jest/globals';

export default jest.fn(() => ({
  id: 'credentials',
  name: 'Credentials',
  type: 'credentials',
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" }
  },
  authorize: jest.fn()
}));