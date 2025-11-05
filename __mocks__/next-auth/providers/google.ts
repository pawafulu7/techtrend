import { jest } from '@jest/globals';

export default jest.fn((options: any = {}) => ({
  id: 'google',
  name: 'Google',
  type: 'oauth',
  authorization: {
    params: {
      scope: 'openid email profile'
    }
  },
  options: {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    ...options,
  },
  profile: jest.fn()
}));
