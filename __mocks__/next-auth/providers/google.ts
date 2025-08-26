import { jest } from '@jest/globals';

export default jest.fn(() => ({
  id: 'google',
  name: 'Google',
  type: 'oauth',
  authorization: {
    params: {
      scope: 'openid email profile'
    }
  },
  profile: jest.fn()
}));