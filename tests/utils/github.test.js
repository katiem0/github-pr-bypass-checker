import { fetchPullRequestDetails, postComment } from '../../src/utils/github.js';
import { jest, describe, beforeEach, test, expect } from '@jest/globals';

describe('GitHub Utility Functions', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    test('fetchPullRequestDetails should make API call with correct parameters', async () => {
        const mockOctokit = {
            pulls: {
                get: jest.fn().mockResolvedValue({ data: { title: 'Test PR' } })
            }
        };
        
        const result = await fetchPullRequestDetails(mockOctokit, 'testOwner', 'testRepo', 123);
        
        expect(mockOctokit.pulls.get).toHaveBeenCalledWith({
            owner: 'testOwner',
            repo: 'testRepo',
            pull_number: 123
        });
        expect(result).toEqual({ title: 'Test PR' });
    });

    test('postComment should make API call with correct parameters', async () => {
        const mockOctokit = {
            issues: {
                createComment: jest.fn().mockResolvedValue({})
            }
        };
        
        await postComment(mockOctokit, 'testOwner', 'testRepo', 123, 'Test comment');
        
        expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
            owner: 'testOwner',
            repo: 'testRepo',
            issue_number: 123,
            body: 'Test comment'
        });
    });
});