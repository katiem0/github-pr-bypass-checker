import { jest } from '@jest/globals';

export const createAppAuth = jest.fn().mockReturnValue(() => 
  Promise.resolve({ token: 'mock-token' })
);