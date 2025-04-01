const { Octokit } = require("@octokit/rest");
const { createAppAuth } = require('@octokit/auth-app');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

/**
 * Create an authenticated Octokit client using GitHub App credentials
 * @returns {Promise<Octokit>} Authenticated Octokit client
 */
async function createOctokitClient() {
    try {
        const appId = process.env.GITHUB_APP_ID;
        const installationId = process.env.INSTALLATION_ID;
        
        if (!appId) {
            logger.error('GITHUB_APP_ID environment variable is not set');
            throw new Error('GitHub App ID is not set in environment variables');
        }
        
        if (!installationId) {
            logger.error('INSTALLATION_ID environment variable is not set');
            throw new Error('Installation ID is not set in environment variables');
        }
        
        // Extract private key from .env file
        let privateKey;
        try {
            const envContent = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
            const privateKeyMatch = envContent.match(/GITHUB_APP_PRIVATE_KEY="([\s\S]*?)"/);
            logger.info('Extracting private key from .env file');
            
            if (privateKeyMatch && privateKeyMatch[1]) {
                privateKey = privateKeyMatch[1];
                logger.info('Successfully extracted private key from .env file');
            } else {
                throw new Error('Could not find private key in .env file');
            }
        } catch (error) {
            logger.error(`Error reading private key: ${error.message}`);
            throw error;
        }
        
        logger.info(`Creating GitHub App authentication with App ID: ${appId}`);
        
        // First create auth function
        const auth = createAppAuth({
            appId: appId,
            privateKey: privateKey,
            installationId: installationId
        });
        
        // Get an installation token
        logger.info(`Getting installation token for installation ID: ${installationId}`);
        const { token } = await auth({ type: "installation" });
        
        // Create Octokit instance with the token
        logger.info('Creating Octokit instance with installation token');
        const octokit = new Octokit({
            auth: token,
            baseUrl: 'https://api.github.com'
        });
        
        logger.info('Successfully created authenticated Octokit client');
        
        return octokit;
    } catch (error) {
        logger.error(`Error creating Octokit client: ${error.message}`);
        throw error;
    }
}

/**
 * Check for bypassed rule suites
 * @param {Object} octokit - Authenticated Octokit client
 * @param {string} owner - Repository owner or organization name
 * @param {string|null} repo - Repository name (null for org-level check)
 * @param {string} ref - Base branch reference
 * @param {string} mergeCommitSha - Merge commit SHA from the pull request
 * @returns {Array} - Array of bypassed rule suite objects
 */
async function checkRepoBypassedRuleSuites(octokit, owner, repo, ref, mergeCommitSha) {
    try {
        const apiPath =`/repos/${owner}/${repo}/rulesets/rule-suites`;
        
        const params = {
            ref: ref,
            rule_suite_result: 'bypass',
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        logger.info(`Checking for bypassed rule suites: ${apiPath} (ref: ${ref})`);
        // Make the API call
        const response = await octokit.request(`GET ${apiPath}`, params);
        
        let ruleSuites = [];

        if (Array.isArray(response.data)) {
            logger.info('Response contains array format of rule suites');
            ruleSuites = response.data;
        } else if (response.data && Array.isArray(response.data.rule_suites)) {
            logger.info('Response contains object with rule_suites array');
            ruleSuites = response.data.rule_suites;
        } else {
            logger.info(`No rule suites found at repository level for ref ${ref} (empty or unexpected format)`);
            return [];
        }
        
        // Log what we found
        logger.info(`Found ${ruleSuites.length} rule suites at repository level`);
        
        // Filter rule suites to those matching our merge commit SHA
        const bypassedRuleSuites = ruleSuites.filter(ruleSuite => {
            return ruleSuite.after_sha === mergeCommitSha;
        });
        
        logger.info(`Found ${bypassedRuleSuites.length} bypassed rule suites with matching merge commit SHA`);
        return bypassedRuleSuites;
        
    } catch (error) {
        const level = 'repository';
        logger.error(`Error checking bypassed rule suites at ${level} level: ${error.message}`);
        
        // More detailed error logging
        if (error.status === 404) {
            logger.error(`API endpoint not found (${apiPath}). This could mean either:
            1. The ${level} doesn't have any rule suites configured
            2. The GitHub App doesn't have the necessary permissions
            3. The rule suites API is not available for this account type`);
        } else if (error.status === 403) {
            logger.error(`Permission denied when accessing rule suites API for ${level}.
            Please check the GitHub App's permissions.`);
        }
        
        // Return empty array instead of throwing to allow the app to continue
        return [];
    }
}
/**
 * Check for bypassed rule suites
 * @param {Object} octokit - Authenticated Octokit client
 * @param {string} owner - Repository owner or organization name
 * @param {string|null} repo - Repository name (null for org-level check)
 * @param {string} ref - Base branch reference
 * @param {string} mergeCommitSha - Merge commit SHA from the pull request
 * @returns {Array} - Array of bypassed rule suite objects
 */
async function checkOrgBypassedRulesSuites(octokit, owner, repo, ref, mergeCommitSha) {
    try {
        const apiPath = `/orgs/${owner}/rulesets/rule-suites`;
        const params = {
            ref: ref,
            rule_suite_result: 'bypass',
            repository_name: repo,
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        };
        
        logger.info(`Checking for bypassed rule suites: ${apiPath} (ref: ${ref})`);
        
        const response = await octokit.request(`GET ${apiPath}`, params);
        
        let ruleSuites = [];
        
        if (Array.isArray(response.data)) {
            logger.info('Response contains array format of rule suites');
            ruleSuites = response.data;
            logger.info(`Data type: ${typeof response.data}, length: ${response.data.length}`);
        } else if (response.data && Array.isArray(response.data.rule_suites)) {
            logger.info('Response contains object with rule_suites array');
            ruleSuites = response.data.rule_suites;
            logger.info(`Data type: ${typeof response.data.rule_suites}, length: ${response.data.rule_suites.length}`);
        } else {

            logger.info(`Unexpected response format. Response data type: ${typeof response.data}`);
            logger.info(`Response data: ${JSON.stringify(response.data).substring(0, 200)}...`);
            logger.info(`No rule suites found at organization level for ref ${ref} (empty or unexpected format)`);
            return [];
        }

        logger.info(`Found ${ruleSuites.length} rule suites at organization level`);
        const bypassedRuleSuites = ruleSuites.filter(ruleSuite => {
            return ruleSuite.after_sha === mergeCommitSha;
        });
        
        logger.info(`Found ${bypassedRuleSuites.length} bypassed rule suites with matching merge commit SHA`);
        return bypassedRuleSuites;
        
    } catch (error) {
        const level = 'organization';
        logger.error(`Error checking bypassed rule suites at ${level} level: ${error.message}`);
        
        // More detailed error logging
        if (error.status === 404) {
            logger.error(`API endpoint not found (${apiPath}). This could mean either:
            1. The ${level} doesn't have any rule suites configured
            2. The GitHub App doesn't have the necessary permissions
            3. The rule suites API is not available for this account type`);
        } else if (error.status === 403) {
            logger.error(`Permission denied when accessing rule suites API for ${level}.
            Please check the GitHub App's permissions.`);
        }
        
        // Return empty array instead of throwing to allow the app to continue
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
                'Accept': 'application/vnd.github.v3+json'
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
    checkRepoBypassedRuleSuites,
    checkOrgBypassedRulesSuites
};