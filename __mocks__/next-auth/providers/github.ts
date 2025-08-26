import { jest } from '@jest/globals';

export default jest.fn(() => ({
  id: 'github',
  name: 'GitHub',
  type: 'oauth',
  authorization: {
    params: {
      scope: 'read:user user:email'
    }
  },
  profile: jest.fn()
}));