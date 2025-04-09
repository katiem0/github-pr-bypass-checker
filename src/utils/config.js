import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import logger from './logger.js';
import process from 'node:process';

/**
 * Load environment variables from .env file
 */
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    logger.debug(`Loading environment variables from ${envPath}`);
    dotenv.config({ path: envPath });
  } else {
    logger.warn('.env file not found - using environment variables');
  }
}

/**
 * Reads the private key directly from the .env file to preserve formatting
 * @returns {string|null} The properly formatted private key or null if not found
 */
function getPrivateKeyFromFile() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      logger.warn('.env file not found when trying to read private key');
      return null;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Match the entire private key including line breaks
    const privateKeyRegex = /GITHUB_APP_PRIVATE_KEY="([\s\S]*?)"/;
    const match = envContent.match(privateKeyRegex);
    
    if (match && match[1]) {
      logger.debug('Successfully extracted private key from .env file');
      return match[1];
    } else {
      logger.warn('Could not find private key in .env file using regex');
      return null;
    }
  } catch (error) {
    logger.error(`Error reading private key from file: ${error.message}`);
    return null;
  }
}

/**
 * Convert string with escaped newlines to actual newlines
 * @param {string} key - Private key with escaped newlines
 * @returns {string} - Private key with actual newlines
 */
function formatPrivateKey(key) {
  if (!key) return null;
  
  // Try to get the key directly from file first
  const fileKey = getPrivateKeyFromFile();
  if (fileKey) {
    logger.debug('Using private key extracted directly from .env file');
    return fileKey;
  }
  
  // As a fallback, try to format the key from environment variable
  logger.debug('Fallback: formatting private key from environment variable');
  
  // Check if the key already contains real newlines
  if (key.includes('-----BEGIN RSA PRIVATE KEY-----') && 
      key.includes('-----END RSA PRIVATE KEY-----') && 
      key.includes('\n')) {
    logger.debug('Private key already has proper formatting');
    return key;
  }
  
  // Remove quotes if they exist
  let formattedKey = key;
  if (formattedKey.startsWith('"') && formattedKey.endsWith('"')) {
    formattedKey = formattedKey.slice(1, -1);
  }
  
  // Replace literal \n with actual newlines
  formattedKey = formattedKey.replace(/\\n/g, '\n');
  
  logger.debug('Formatted private key with newlines');
  return formattedKey;
}

/**
 * Get GitHub App credentials with proper formatting
 * @returns {Object} GitHub credentials
 */
function getGitHubCredentials() {
  loadEnv();
  
  const rawPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const formattedPrivateKey = formatPrivateKey(rawPrivateKey);
  
  if (formattedPrivateKey) {
    // Log first and last few characters to verify formatting without exposing the key
    const firstChars = formattedPrivateKey.substring(0, 30);
    const lastChars = formattedPrivateKey.substring(formattedPrivateKey.length - 30);
    logger.debug(`Private key start: ${firstChars}...`);
    logger.debug(`Private key end: ...${lastChars}`);
  } else {
    logger.error('Failed to format private key');
  }
  
  return {
    appId: process.env.GITHUB_APP_ID,
    privateKey: formattedPrivateKey,
    installationId: process.env.INSTALLATION_ID,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    appName: process.env.GITHUB_APP_NAME,
    webhookProxyUrl: process.env.WEBHOOK_PROXY_URL
  };
}

/**
 * Get deployment configuration
 * @returns {Object} Deployment configuration
 */
function getDeploymentConfig() {
  loadEnv();
  
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    githubApiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    webhookProxyUrl: process.env.WEBHOOK_PROXY_URL || null
  };
}

export {
  getGitHubCredentials,
  getDeploymentConfig,
  loadEnv
};