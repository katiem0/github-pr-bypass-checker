import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { handlePullRequest, validateRuleset } from '../../src/handlers/pullRequest.js';
import logger from '../../src/utils/logger.js';
import { setupGitHubMocks } from '../__mocks__/githubMocks.js';

// Helper function to find a specific message in logger calls
function findLoggerCall(mockFn, stringToFind) {
  const calls = mockFn.mock.calls || [];
  return calls.find(call => 
    typeof call[0] === 'string' && call[0].includes(stringToFind)
  );
}

// Helper function to get the last call to a mock function
function getLastCall(mockFn) {
  const calls = mockFn.mock.calls || [];
  return calls.length > 0 ? calls[calls.length - 1] : null;
}

// Helper function to check if a mock function was called with a specific message
function expectMockCalledWith(mockFn, stringToFind) {
  const matchingCall = findLoggerCall(mockFn, stringToFind);
  
  // Print debug info if no match found
  if (!matchingCall) {
    const calls = mockFn.mock.calls || [];
    console.log(`No call found containing "${stringToFind}". All calls:`);
    calls.forEach((call, i) => {
      console.log(`Call ${i + 1}:`, call[0]);
    });
    return false;
  }
  return true;
}

describe('Pull Request Handler', () => {
  beforeEach(() => {
    // Reset and configure mocks before each test
    jest.resetAllMocks();
    setupGitHubMocks();
    
    // Make sure logger is properly mocked
    if (!jest.isMockFunction(logger.info)) {
      logger.info = jest.fn();
    }
    if (!jest.isMockFunction(logger.warn)) {
      logger.warn = jest.fn();
    }
    if (!jest.isMockFunction(logger.error)) {
      logger.error = jest.fn();
    }
  });

  test('validateRuleset should return true by default', () => {
    const result = validateRuleset({
      number: 123,
    });

    expect(result).toBe(true);
    expect(expectMockCalledWith(logger.info, 'Reviewing ruleset for PR #123')).toBe(true);
  });

  test('validateRuleset should handle errors and return true', () => {
    logger.info.mockImplementation(() => {
      throw new Error('Test error');
    });

    const result = validateRuleset({
      number: 123
    });

    expect(result).toBe(true);
    expect(expectMockCalledWith(logger.error, 'Test error')).toBe(true);
  });

  test('handlePullRequest should skip non-merged PRs', async () => {
    const context = {
      payload: {
        action: 'closed',
        pull_request: {
          number: 123,
          merged: false
        }
      }
    };

    await handlePullRequest(context);
    
    const skipMessageCall = findLoggerCall(logger.info, 'Skipping ruleset bypass check');
    const lastCall = getLastCall(logger.info);
    const lastMessageHasSkipText = lastCall && 
      typeof lastCall[0] === 'string' && 
      lastCall[0].includes('Skipping ruleset bypass check');
    
    expect(skipMessageCall).toBeTruthy();
    expect(lastMessageHasSkipText).toBe(true);
  });

  test('handlePullRequest should process merged PRs', async () => {
    const context = {
      payload: {
        action: 'closed',
        pull_request: {
          number: 123,
          merged: true,
          base: {
            repo: {
              full_name: 'owner/repo'
            },
            ref: 'main'
          },
          merge_commit_sha: 'abcd1234'
        }
      }
    };

    await handlePullRequest(context);

    expect(expectMockCalledWith(logger.info, 'was merged, checking for ruleset bypasses')).toBe(true);
  });


  test('handlePullRequest should handle missing payloads', async () => {
    await handlePullRequest({});

    expect(expectMockCalledWith(logger.error, 'No payload in webhook context')).toBe(true);
  });

  test('handlePullRequest should handle missing pull requests', async () => {
    await handlePullRequest({ payload: {} });

    expect(expectMockCalledWith(logger.error, 'No pull request in payload')).toBe(true);
  });

  test('handlePullRequest should skip pull requests without merge commit', async () => {
    const context = {
      payload: {
        action: 'closed',
        pull_request: {
          number: 123,
          merged: true,
          base: {
            repo: {
              full_name: 'owner/repo'
            },
            ref: 'main'
          },
          merge_commit_sha: null
        }
      }
    };

    await handlePullRequest(context);

    const closedMessageCall = findLoggerCall(logger.info, 'closed without merging');
    expect(closedMessageCall).toBeTruthy();
  });
});