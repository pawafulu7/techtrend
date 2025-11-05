import { jest } from '@jest/globals';

export default jest.fn((options: any = {}) => ({
  id: 'github',
  name: 'GitHub',
  type: 'oauth',
  authorization: {
    params: {
      scope: 'read:user user:email'
    }
  },
  options: {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    ...options,
  },
  profile: jest.fn()
}));
