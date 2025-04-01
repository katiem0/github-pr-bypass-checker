const { handlePullRequest } = require('../../src/handlers/pullRequest');
const { createOctokitClient, postComment } = require('../../src/utils/github');

// Mock dependencies
jest.mock('../../src/utils/github');
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('Pull Request Closed Handler', () => {
    let mockOctokit;
    let mockContext;
    
    beforeEach(() => {
        // Create a mock Octokit instance with necessary methods
        mockOctokit = {
            request: jest.fn().mockResolvedValue({
                data: {
                    rule_suites: [
                        {
                            rule_id: 'rule-123',
                            source_ref: 'main',
                            after_sha: 'merge-sha-123',
                            status: 'bypass'
                        }
                    ]
                }
            }),
            issues: {
                createComment: jest.fn().mockResolvedValue({})
            }
        };
        
        // Mock the Octokit client creation
        createOctokitClient.mockResolvedValue(mockOctokit);
        postComment.mockResolvedValue(undefined);
        
        // Create a mock webhook context for a closed PR
        mockContext = {
            payload: {
                action: 'closed',
                pull_request: {
                    number: 123,
                    merged: true,
                    merge_commit_sha: 'merge-sha-123',
                    base: {
                        ref: 'main',
                        repo: {
                            full_name: 'test-owner/test-repo'
                        }
                    }
                }
            }
        };
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    test('should check rule suites when pull request is merged', async () => {
        await handlePullRequest(mockContext);
        
        // Verify that the API was called correctly for repo-level rules
        expect(mockOctokit.request).toHaveBeenCalledWith(
            expect.stringContaining('/repos/test-owner/test-repo/rule-suites'),
            expect.objectContaining({
                ref: 'main',
                rule_suite_result: 'bypass'
            })
        );
        
        // Verify that a comment was posted about bypassed rules
        expect(postComment).toHaveBeenCalledWith(
            mockOctokit,
            'test-owner',
            'test-repo',
            123,
            expect.stringContaining('Ruleset Bypass Detected')
        );
    });
    
    test('should not check rule suites when pull request is closed without merging', async () => {
        mockContext.payload.pull_request.merged = false;
        mockContext.payload.pull_request.merge_commit_sha = null;
        
        await handlePullRequest(mockContext);
        
        // Verify that the API was not called
        expect(mockOctokit.request).not.toHaveBeenCalled();
        expect(postComment).not.toHaveBeenCalled();
    });
});