const { handlePullRequest } = require('../../src/handlers/pullRequest');
const { validateRuleset } = require('../../src/handlers/ruleset');
const { postComment } = require('../../src/utils/github');

jest.mock('../../src/handlers/ruleset');
jest.mock('../../src/utils/github');

describe('handlePullRequest', () => {
    let pullRequest;

    beforeEach(() => {
        pullRequest = {
            number: 1,
            title: 'Test PR',
            user: { login: 'testuser' },
            head: { sha: 'abc123' },
            base: { repo: { full_name: 'test/repo' } },
        };
    });

    it('should post a comment if ruleset is bypassed', async () => {
        validateRuleset.mockReturnValue(false);
        await handlePullRequest(pullRequest);
        expect(postComment).toHaveBeenCalledWith(
            pullRequest.base.repo.full_name,
            pullRequest.number,
            expect.stringContaining('bypassed the ruleset')
        );
    });

    it('should not post a comment if ruleset is not bypassed', async () => {
        validateRuleset.mockReturnValue(true);
        await handlePullRequest(pullRequest);
        expect(postComment).not.toHaveBeenCalled();
    });
});