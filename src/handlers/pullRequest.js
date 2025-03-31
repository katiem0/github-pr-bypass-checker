const { validateRuleset } = require('./ruleset');
const { postComment } = require('../utils/github');

async function handlePullRequest(context) {
    const pullRequest = context.payload.pull_request;

    if (!pullRequest) {
        return;
    }

    const bypassed = !validateRuleset(pullRequest);

    if (bypassed) {
        const comment = 'This pull request has bypassed the required rulesets.';
        await postComment(pullRequest.number, comment);
    }
}

module.exports = { handlePullRequest };