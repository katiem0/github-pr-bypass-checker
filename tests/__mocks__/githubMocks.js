import { jest } from '@jest/globals';

// Create mock functions for GitHub utilities
export const mockCreateOctokit = jest.fn().mockResolvedValue({});
export const mockPostComment = jest.fn().mockResolvedValue(undefined);
export const mockCheckRepoBypassedRuleSuites = jest.fn().mockResolvedValue([]);
export const mockFetchPullRequestDetails = jest.fn().mockResolvedValue({});
export const mockGetRuleSuites = jest.fn().mockResolvedValue({});

// Setup function to reset and configure default mock behaviors
export function setupGitHubMocks() {
  jest.resetAllMocks();
  
  // Reset mock implementations
  mockCreateOctokit.mockClear().mockResolvedValue({});
  mockPostComment.mockClear().mockResolvedValue(undefined);
  mockCheckRepoBypassedRuleSuites.mockClear().mockResolvedValue([]);
  mockFetchPullRequestDetails.mockClear().mockResolvedValue({});
  mockGetRuleSuites.mockClear().mockResolvedValue({});
}