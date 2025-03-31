module.exports = {
    fetchPullRequestDetails: async (octokit, owner, repo, pull_number) => {
        const { data } = await octokit.pulls.get({
            owner,
            repo,
            pull_number,
        });
        return data;
    },

    postComment: async (octokit, owner, repo, pull_number, comment) => {
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: comment,
        });
    },
};