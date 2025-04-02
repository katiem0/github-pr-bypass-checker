const { Octokit } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");
const logger = require('./logger');
const { getGitHubCredentials } = require('./config');

/**
 * Create an authenticated Octokit client using GitHub App credentials
 * @returns {Promise<Octokit>} Authenticated Octokit client
 */
async function createOctokitClient() {
    try {
        const { appId, privateKey, installationId } = getGitHubCredentials();
        
        if (!appId) {
            logger.error('GITHUB_APP_ID environment variable is not set');
            throw new Error('GitHub App ID is not set in environment variables');
        }
        
        if (!installationId) {
            logger.error('INSTALLATION_ID environment variable is not set');
            throw new Error('Installation ID is not set in environment variables');
        }
        
        // Use private key directly from environment
        if (!privateKey) {
            logger.error('GITHUB_APP_PRIVATE_KEY environment variable is not set');
            throw new Error('GitHub App private key is not set in environment variables');
        }
        
        logger.info(`Creating GitHub App authentication with App ID: ${appId}`);
        logger.debug(`Private key format check: starts with "-----BEGIN"? ${privateKey.startsWith('-----BEGIN')}`);
        
        
        // Create auth function
        const auth = createAppAuth({
            appId: appId,
            privateKey: privateKey,
            installationId: installationId
        });
        
        let token;
        let retries = 3;
        
        while (retries > 0) {
            try {
                logger.info(`Getting installation token for installation ID: ${installationId}`);
                const authResult = await auth({ type: "installation" });
                token = authResult.token;
                break;
            } catch (error) {
                retries--;
                if (retries === 0) {
                    throw error;
                }
                logger.warn(`Error getting token, retrying (${retries} attempts left): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        // Create Octokit instance with the token
        logger.info('Creating Octokit instance with installation token');
        const octokit = new Octokit({
            auth: token,
            baseUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
            request: {
                timeout: 10000, // 10 second timeout
                retries: 3,
                retryAfter: 1 // 1 second between retries
            }
        });
        
        logger.info('Successfully created authenticated Octokit client');
        
        return octokit;
    } catch (error) {
        logger.error(`Error creating Octokit client: ${error.message}`);
        if (error.message.includes('secretOrPrivateKey must be an asymmetric key')) {
            logger.error('Private key format error. Make sure your .env file contains the private key with actual newlines, not \\n characters.');
            logger.error('Example of correct format: -----BEGIN RSA PRIVATE KEY-----\nMII...\n-----END RSA PRIVATE KEY-----');
        }
        throw error;
    }
}

/**
 * Check for bypassed rule suites at repository level
 * @param {Object} octokit - Authenticated Octokit client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} ref - Base branch reference
 * @param {string} mergeCommitSha - Merge commit SHA from the pull request
 * @returns {Array} - Array of bypassed rule suite objects
 */
async function checkRepoBypassedRuleSuites(octokit, owner, repo, ref, mergeCommitSha) {
    try {
        const apiPath = `/repos/${owner}/${repo}/rulesets/rule-suites`;
        
        const params = {
            ref: ref,
            rule_suite_result: 'bypass',
            headers: {
                'Accept': 'application/vnd.github.v3+json, application/vnd.github.luke-cage-preview+json, application/vnd.github.rep-preview+json'
            }
        };
        
        logger.info(`Checking for bypassed repo-level rule suites: ${apiPath} (ref: ${ref})`);
        
        let ruleSuites = [];
        let response;
        
        try {
            // Try the new format first
            response = await octokit.request(`GET ${apiPath}`, params);
            
            if (Array.isArray(response.data)) {
                logger.info('Response contains array format of rule suites');
                ruleSuites = response.data;
            } else if (response.data && Array.isArray(response.data.rule_suites)) {
                logger.info('Response contains object with rule_suites array');
                ruleSuites = response.data.rule_suites;
            }
        } catch (error) {
            if (error.status === 404) {
                // Try the old format as fallback
                const fallbackPath = `/repos/${owner}/${repo}/rule-suites`;
                logger.info(`API endpoint not found, trying fallback: ${fallbackPath}`);
                
                try {
                    response = await octokit.request(`GET ${fallbackPath}`, params);
                    if (Array.isArray(response.data)) {
                        ruleSuites = response.data;
                    } else if (response.data && Array.isArray(response.data.rule_suites)) {
                        ruleSuites = response.data.rule_suites;
                    }
                } catch (fallbackError) {
                    logger.error(`Fallback API endpoint also failed: ${fallbackError.message}`);
                    throw fallbackError;
                }
            } else {
                throw error;
            }
        }
        
        // Log what we found
        logger.info(`Found ${ruleSuites.length} rule suites at repository level`);
        
        // Filter rule suites to those matching our merge commit SHA
        const bypassedRuleSuites = ruleSuites.filter(ruleSuite => {
            return ruleSuite.after_sha === mergeCommitSha;
        });
        
        logger.info(`Found ${bypassedRuleSuites.length} bypassed repo-level rule suites with matching merge commit SHA`);
        return bypassedRuleSuites;
        
    } catch (error) {
        logger.error(`Error checking bypassed rule suites at repository level: ${error.message}`);
        return [];
    }
}

module.exports = {
    fetchPullRequestDetails: async (octokit, owner, repo, pull_number) => {
        try {
            const { data } = await octokit.pulls.get({
                owner,
                repo,
                pull_number,
            });
            return data;
        } catch (error) {
            logger.error(`Error fetching PR details: ${error.message}`);
            throw error;
        }
    },

    postComment: async (octokit, owner, repo, pull_number, comment) => {
        try {
            await octokit.issues.createComment({
                owner,
                repo,
                issue_number: pull_number,
                body: comment,
            });
            logger.info(`Comment posted to PR #${pull_number}`);
        } catch (error) {
            logger.error(`Error posting comment: ${error.message}`);
            throw error;
        }
    },
    
    getRuleSuites: async (octokit, owner, repo, params = {}) => {
        try {
            // Add required headers
            params.headers = {
                'Accept': 'application/vnd.github.v3+json, application/vnd.github.luke-cage-preview+json, application/vnd.github.rep-preview+json'
            };
            
            const endpoint = repo ? 
                `/repos/${owner}/${repo}/rulesets/rule-suites` : 
                `/orgs/${owner}/rulesets/rule-suites`;
                
            const response = await octokit.request(`GET ${endpoint}`, params);
            return response.data;
        } catch (error) {
            logger.error(`Error fetching rule suites: ${error.message}`);
            return { rule_suites: [] }; // Return empty object with expected structure
        }
    },
    
    createOctokitClient,
    checkRepoBypassedRuleSuites
};