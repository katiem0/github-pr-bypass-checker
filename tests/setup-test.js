import { jest } from '@jest/globals';
import * as mockFunctions from './__mocks__/githubMocks.js';

// First, mock the logger
jest.mock('../src/utils/logger.js', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Next, mock the config module since it might be used by github.js
jest.mock('../src/utils/config.js', () => ({
  getGitHubCredentials: jest.fn().mockReturnValue({
    appId: 'mock-app-id',
    privateKey: 'mock-private-key',
    installationId: 'mock-installation-id'
  })
}));

// Now mock github.js with actual implementations that prevent API calls
jest.mock('../src/utils/github.js', () => ({
  createOctokitClient: mockFunctions.mockCreateOctokit,
  postComment: mockFunctions.mockPostComment,
  checkRepoBypassedRuleSuites: mockFunctions.mockCheckRepoBypassedRuleSuites,
  fetchPullRequestDetails: mockFunctions.mockFetchPullRequestDetails,
  getRuleSuites: mockFunctions.mockGetRuleSuites
}));