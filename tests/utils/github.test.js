import { fetchPullRequest, postComment } from '../../src/utils/github.js';
import { validateRuleset } from '../../src/handlers/ruleset.js';
import { jest } from '@jest/globals';

describe('GitHub Utility Functions', () => {
    let mockFetchPullRequest;
    let mockPostComment;

    beforeEach(() => {
        mockFetchPullRequest = jest.spyOn(require('../../src/utils/github'), 'fetchPullRequest');
        mockPostComment = jest.spyOn(require('../../src/utils/github'), 'postComment');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('fetchPullRequest should be called with correct parameters', async () => {
        const pullRequestId = 1;
        await fetchPullRequest(pullRequestId);
        expect(mockFetchPullRequest).toHaveBeenCalledWith(pullRequestId);
    });

    test('postComment should be called with correct parameters', async () => {
        const pullRequestId = 1;
        const comment = 'This merge bypasses the ruleset.';
        await postComment(pullRequestId, comment);
        expect(mockPostComment).toHaveBeenCalledWith(pullRequestId, comment);
    });

    test('validateRuleset should return true if ruleset is bypassed', () => {
        const rulesetConditions = { condition: 'some condition' };
        const result = validateRuleset(rulesetConditions);
        expect(result).toBe(true);
    });

    test('validateRuleset should return false if ruleset is not bypassed', () => {
        const rulesetConditions = { condition: 'another condition' };
        const result = validateRuleset(rulesetConditions);
        expect(result).toBe(false);
    });
});