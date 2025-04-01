const { createOctokitClient, postComment, checkRepoBypassedRuleSuites, checkOrgBypassedRulesSuites } = require('../utils/github');
const logger = require('../utils/logger');

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

        if (action === 'closed' && pullRequest.merged) {
            await handlePullRequestClosed(pullRequest);
        } else {
            // Handle other pull request events
            const bypassed = !validateRuleset(pullRequest);

            if (bypassed) {
                const comment = 'This pull request has bypassed the required rulesets.';
                const octokit = await createOctokitClient();
                const [owner, repo] = pullRequest.base.repo.full_name.split('/');
                await postComment(octokit, owner, repo, pullRequest.number, comment);
            }
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
        
        // Initialize variables to collect bypass information
        let bypassFound = false;
        let orgBypassedRuleSuites = [];
        let repoBypassedRuleSuites = [];
        
        // Fetch rule suites at the organization level
        try {
            orgBypassedRuleSuites = await checkOrgBypassedRulesSuites(
                octokit, 
                owner, 
                null,  // null indicates org-level check
                baseRef, 
                mergeCommitSha
            );
            
            if (orgBypassedRuleSuites && orgBypassedRuleSuites.length > 0) {
                bypassFound = true;
                logger.info(`Found ${orgBypassedRuleSuites.length} bypassed org-level rule suites for PR #${pullRequest.number}`);
            } else {
                logger.info(`No bypassed org-level rule suites found for PR #${pullRequest.number}`);
            }
        } catch (error) {
            logger.warn(`Could not check org-level rule suites: ${error.message}`);
        }
        
        // Fetch rule suites at the repository level
        try {
            repoBypassedRuleSuites = await checkRepoBypassedRuleSuites(
                octokit, 
                owner, 
                repo,  // Including repo indicates repo-level check
                baseRef, 
                mergeCommitSha
            );
            
            if (repoBypassedRuleSuites && repoBypassedRuleSuites.length > 0) {
                bypassFound = true;
                logger.info(`Found ${repoBypassedRuleSuites.length} bypassed repo-level rule suites for PR #${pullRequest.number}`);
            } else {
                logger.info(`No bypassed repo-level rule suites found for PR #${pullRequest.number}`);
            }
        } catch (error) {
            logger.warn(`Could not check repo-level rule suites: ${error.message}`);
        }
        
        // Post a combined comment if any bypasses were found
        if (bypassFound) {
            await postCombinedRulesetBypassComment(
                octokit,
                owner,
                repo,
                pullRequest.number,
                orgBypassedRuleSuites,
                repoBypassedRuleSuites,
                baseRef
            );
        } else {
            logger.info(`No ruleset bypasses found for PR #${pullRequest.number}`);
        }
    } catch (error) {
        logger.error(`Error processing closed pull request: ${error.message}`);
    }
}

/**
 * Post a combined comment about bypassed rulesets to the pull request
 * @param {Object} octokit - Authenticated Octokit client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} pullNumber - Pull request number
 * @param {Array} orgRuleSuites - Array of bypassed org-level rule suite objects
 * @param {Array} repoRuleSuites - Array of bypassed repo-level rule suite objects
 * @param {string} baseRef - Base reference (branch) of the pull request
 */
async function postCombinedRulesetBypassComment(octokit, owner, repo, pullNumber, orgRuleSuites, repoRuleSuites, baseRef) {
    try {
        // Format org-level rule info if available
        let orgRulesInfo = '';
        if (orgRuleSuites && orgRuleSuites.length > 0) {
            // Create URL to org ruleset insights filtered for bypassed rules
            const orgRulesetUrl = `https://github.com/organizations/${owner}/settings/rules/insights?repository=${repo}&time_period=day&rule_status=bypass`;
            
            orgRulesInfo = `### Organization-Level Bypasses
[View Bypassed Organization Ruleset Insights](${orgRulesetUrl})

${formatRuleSuites(orgRuleSuites)}
`;
        }
        
        // Format repo-level rule info if available
        let repoRulesInfo = '';
        if (repoRuleSuites && repoRuleSuites.length > 0) {
            // Create URL to repo ruleset insights filtered for bypassed rules
            const repoRulesetUrl = `https://github.com/${owner}/${repo}/settings/rules/insights?ref=${encodeURIComponent(baseRef)}&time_period=day&rule_status=bypass`;
            
            repoRulesInfo = `### Repository-Level Bypasses
[View Bypassed Repository Ruleset Insights](${repoRulesetUrl})

${formatRuleSuites(repoRuleSuites)}
`;
        }
        
        // Create combined comment
        const totalBypasses = (orgRuleSuites?.length || 0) + (repoRuleSuites?.length || 0);
        
        const comment = `## 🚨 Ruleset Bypass Detected

This pull request was merged with **${totalBypasses}** levels of bypassed ruleset(s).

${orgRulesInfo}
${repoRulesInfo}

---

Please ensure these bypasses comply with your organization's governance policies. Bypassing ruleset protections may introduce security, quality, or compliance risks.`;
        
        await postComment(octokit, owner, repo, pullNumber, comment);
        logger.info(`Posted combined ruleset bypass comment on PR #${pullNumber} with ${totalBypasses} bypasses`);
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
    
    return ruleSuites.map((ruleSuite, index) => {
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

module.exports = { handlePullRequest, validateRuleset };