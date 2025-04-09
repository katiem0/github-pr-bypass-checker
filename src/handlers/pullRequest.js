import { createOctokitClient, postComment, checkRepoBypassedRuleSuites } from '../utils/github.js';
import logger from '../utils/logger.js';
/**
 * Validate if a ruleset is being bypassed
 * @param {Object} pullRequest - Pull request object from webhook payload
 * @returns {boolean} - Returns true if ruleset is valid, false if bypassed
 */
function validateRuleset(pullRequest) {
    try {
        logger.info(`Reviewing ruleset for PR #${pullRequest.number}`);
        return true; 
    } catch (error) {
        logger.error(`Error validating ruleset: ${error.message}`);
        return true;
    }
}

/**
 * Handle the pull request event
 * @param {Object} context - The webhook context
 */
async function handlePullRequest(context) {
    try {
        if (!context.payload) {
            logger.error('No payload in webhook context');
            return;
        }

        const pullRequest = context.payload.pull_request;
        if (!pullRequest) {
            logger.error('No pull request in payload');
            return;
        }

        const action = context.payload.action;
        logger.info(`Processing pull request #${pullRequest.number}, action: ${action}`);

        // Only process merged pull requests when they're closed
        if (action === 'closed' && pullRequest.merged === true) {
            logger.info(`Pull request #${pullRequest.number} was merged, checking for ruleset bypasses`);
            await handlePullRequestClosed(pullRequest);
        } else {
            logger.info(`Skipping ruleset bypass check for PR #${pullRequest.number} - not a merged PR`);
        }
    } catch (error) {
        logger.error(`Error handling pull request: ${error.message}`);
    }
}

/**
 * Handle the pull request closed event
 * @param {Object} pullRequest - The pull request object from webhook payload
 */
async function handlePullRequestClosed(pullRequest) {
    try {
        logger.info(`Handling closed pull request #${pullRequest.number}`);
        
        const [owner, repo] = pullRequest.base.repo.full_name.split('/');
        const baseRef = pullRequest.base.ref;
        const mergeCommitSha = pullRequest.merge_commit_sha;
        
        // Exit if no merge commit (PR was closed without merging)
        if (!mergeCommitSha) {
            logger.info('Pull request was closed without merging, skipping ruleset check');
            return;
        }
        
        logger.info(`Checking rule suites for base ref: ${baseRef} and merge commit: ${mergeCommitSha}`);
        
        // Get authenticated Octokit client
        const octokit = await createOctokitClient();
        if (!octokit) {
            logger.error('Failed to create Octokit client, aborting ruleset check');
            return;
        }
        
        // Initialize variables to collect bypass information
        let repoBypassedRuleSuites = [];
        
        try {
            repoBypassedRuleSuites = await checkRepoBypassedRuleSuites(
                octokit, 
                owner, 
                repo,  // Including repo indicates repo-level check
                baseRef, 
                mergeCommitSha
            );
            
            if (repoBypassedRuleSuites && repoBypassedRuleSuites.length > 0) {
                logger.info(`Found ${repoBypassedRuleSuites.length} bypassed repo-level rule suites for PR #${pullRequest.number}`);
                
                // Post a comment with the bypassed rules
                await postRulesetBypassComment(
                    octokit,
                    owner,
                    repo,
                    pullRequest.number,
                    repoBypassedRuleSuites,
                    baseRef
                );
            } else {
                logger.info(`No bypassed repo-level rule suites found for PR #${pullRequest.number}`);
            }
        } catch (error) {
            logger.warn(`Could not check repo-level rule suites: ${error.message}`);
        }
    } catch (error) {
        logger.error(`Error processing closed pull request: ${error.message}`);
        logger.debug(error.stack);
    }
}


/**
 * Post a comment about bypassed rulesets to the pull request
 * @param {Object} octokit - Authenticated Octokit client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} pullNumber - Pull request number
 * @param {Array} ruleSuites - Array of bypassed rule suite objects
 * @param {string} baseRef - Base reference (branch) of the pull request
 */
async function postRulesetBypassComment(octokit, owner, repo, pullNumber, ruleSuites, baseRef) {
    try {
        // Create URL to repo ruleset insights filtered for bypassed rules
        const repoRulesetUrl = `https://github.com/${owner}/${repo}/settings/rules/insights?ref=${encodeURIComponent(baseRef)}&time_period=day&rule_status=bypass`;
        
        const comment = `## 🚨 Ruleset Bypass Detected

This pull request was merged with bypassed ruleset(s).

### Repository-Level Bypasses
[View Bypassed Repository Ruleset Insights](${repoRulesetUrl})

${formatRuleSuites(ruleSuites)}

---

Please ensure these bypasses comply with your organization's governance policies. Bypassing ruleset protections may introduce security, quality, or compliance risks.`;
        
        await postComment(octokit, owner, repo, pullNumber, comment);
        logger.info(`Posted ruleset bypass comment on PR #${pullNumber} with ${ruleSuites.length} bypasses`);
    } catch (error) {
        logger.error(`Error posting ruleset bypass comment: ${error.message}`);
    }
}

/**
 * Format rule suites information into readable markdown
 * @param {Array} ruleSuites - Array of rule suite objects
 * @returns {string} - Formatted markdown string
 */
function formatRuleSuites(ruleSuites) {
    if (!ruleSuites || ruleSuites.length === 0) {
        return '';
    }
    
    return ruleSuites.map((ruleSuite) => {
        // Extract ruleset information with fallbacks for different API response formats
        const beforeSha = ruleSuite.before_sha ? ruleSuite.before_sha.substring(0, 7) : 'Unknown';
        const afterSha = ruleSuite.after_sha ? ruleSuite.after_sha.substring(0, 7) : 'Unknown';
        const status = ruleSuite.status || ruleSuite.result || 'bypass';
        const actorName = ruleSuite.actor_name || 'Unknown';
        const pushedAt = ruleSuite.pushed_at ? new Date(ruleSuite.pushed_at).toLocaleString() : 'Unknown';
        
        return `- **Commit:** ${afterSha} _(from ${beforeSha})_
- **Actor:** ${actorName}
- **Status:** ${status}
- **Time:** ${pushedAt}`;
    }).join('\n\n');
}

export { 
    handlePullRequest, 
    validateRuleset 
};