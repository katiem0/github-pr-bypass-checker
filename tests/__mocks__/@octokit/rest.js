import { jest } from '@jest/globals';

// Mock the Octokit library to prevent any real API calls
export const Octokit = jest.fn().mockImplementation(() => ({
  request: jest.fn().mockImplementation(() => Promise.resolve({ data: [] })),
  pulls: {
    get: jest.fn().mockResolvedValue({ data: {} })
  },
  issues: {
    createComment: jest.fn().mockResolvedValue({})
  }
}));