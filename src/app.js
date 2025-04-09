import express from 'express';
import bodyParser from 'body-parser';
import { Buffer } from 'node:buffer';
import crypto from 'crypto';
import { handlePullRequest } from './handlers/pullRequest.js';
import logger from './utils/logger.js';
import process from 'node:process';
import { getGitHubCredentials, getDeploymentConfig, loadEnv } from './utils/config.js';

const processedWebhooks = new Set();
const { port, nodeEnv } = getDeploymentConfig();
const { appId, privateKey, webhookSecret } = getGitHubCredentials();
loadEnv();

// Log basic configuration (avoid logging sensitive values)
logger.info(`GitHub Ruleset Checker starting...`);
logger.info(`Environment: ${nodeEnv}`);
logger.info(`GitHub App ID: ${appId ? 'configured' : 'missing'}`);
logger.info(`GitHub App Private Key: ${privateKey ? 'configured' : 'missing'}`);
logger.info(`Webhook Secret: ${webhookSecret ? 'configured' : 'missing'}`);

const app = express();

// Handle development environment setup
if (nodeEnv === 'development') {
  const { webhookProxyUrl } = getGitHubCredentials();
  logger.info(`Development mode: ${webhookProxyUrl ? 'Using Smee proxy' : 'Direct webhook handling'}`);
  
  // Only set up Smee in development with a configured URL
  if (webhookProxyUrl) {
    setupDevelopmentProxy(webhookProxyUrl, port);
  }
}

/**
 * Set up a development proxy (Smee) for local webhook testing
 * @param {string} proxyUrl - The Smee proxy URL
 * @param {number} serverPort - The local server port
 */
async function setupDevelopmentProxy(proxyUrl, serverPort) {
  try {
    logger.info(`Setting up development webhook proxy with URL: ${proxyUrl}`);
    
    // For Node.js 18+, ensure we have the fetch polyfill
    if (!globalThis.fetch) {
      try {
        const { default: nodeFetch, Headers, Request, Response } = await import('node-fetch');
        globalThis.fetch = nodeFetch;
        globalThis.Headers = Headers;
        globalThis.Request = Request;
        globalThis.Response = Response;
        logger.info('Successfully added fetch polyfill for Smee client');
      } catch (fetchError) {
        logger.error(`Could not load node-fetch: ${fetchError.message}`);
        logger.error('Try running: npm install node-fetch@2');
        return null;
      }
    }
    
    try {
      const { default: SmeeClient } = await import('smee-client');
      
      if (!SmeeClient) {
        throw new Error('SmeeClient is undefined after import');
      }
      
      const smee = new SmeeClient({
        source: proxyUrl,
        target: `http://localhost:${serverPort}/webhook`,
        logger: {
          info: message => logger.info(`[Smee] ${message}`),
          error: message => logger.error(`[Smee] ${message}`)
        }
      });

      logger.info(`Starting Smee client to forward ${proxyUrl} to http://localhost:${serverPort}/webhook`);
      
      smee.start();
      logger.info('[Smee] Client started successfully');
      
    } catch (smeeError) {
      logger.error(`Failed to initialize Smee client: ${smeeError.message}`);
      logger.error(smeeError.stack);
      return null;
    }
  } catch (error) {
    logger.error(`Failed to setup development proxy: ${error.message}`);
    logger.error(error.stack);
    return null;
  }
}

// Configure body parser with webhook signature verification
app.use(bodyParser.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (buf && buf.length && webhookSecret) {
      req.rawBody = buf;
      // Store the signature for later verification
      const signature = req.headers['x-hub-signature-256'];
      if (signature) {
        req.signature = signature;
      }
    }
  }
}));

// Configure standard middleware
app.use((req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'deny');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Middleware to verify GitHub webhook signatures
function verifyGitHubWebhook(req, res, next) {
  // Skip verification if webhook secret is not configured or in test mode
  if (nodeEnv === 'test' || !webhookSecret || !req.rawBody || !req.signature) {
    if (nodeEnv !== 'test') {
      logger.warn('Webhook signature verification skipped - missing data or webhook secret');
    }
    return next();
  }
  
  try {
    // Calculate the expected signature
    const signature = `sha256=${crypto
      .createHmac('sha256', webhookSecret)
      .update(req.rawBody)
      .digest('hex')}`;
      
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(req.signature))) {
      next();
    } else {
      logger.warn('Invalid webhook signature received');
      res.status(401).send('Invalid signature');
    }
  } catch (error) {
    logger.error(`Error verifying webhook signature: ${error.message}`);
    res.status(500).send('Error verifying webhook signature');
  }
}

// Webhook endpoint with signature verification
app.post('/webhook', verifyGitHubWebhook, (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const action = req.body.action;
    const deliveryId = req.headers['x-github-delivery'];
    
    logger.info(`Webhook received: ${event}.${action || 'unknown'} (${deliveryId || 'no-id'})`);
    
    // Always return 202 Accepted immediately to GitHub
    // This prevents GitHub from retrying if our processing takes too long
    res.status(202).send('Webhook received. Processing started.');
    
    // Then process the webhook asynchronously
    processWebhook(event, action, req.body, deliveryId)
      .catch(error => {
        logger.error(`Error in async webhook processing: ${error.message}`);
      });
  } catch (error) {
    logger.error(`Error handling webhook request: ${error.message}`);
    // Only send error response if we haven't already sent a response
    if (!res.headersSent) {
      res.status(500).send('Error processing webhook');
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
      status: 'healthy',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      memoryUsage: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          external: Math.round(process.memoryUsage().external / 1024 / 1024) + 'MB'
      },
      processedWebhooks: processedWebhooks.size
  };
  
  res.status(200).json(healthStatus);
});

app.get('/metrics', (req, res) => {
  const metrics = {
      webhooks: {
          processed: processedWebhooks.size,
      },
      memory: process.memoryUsage(),
      uptime: process.uptime()
  };
  
  res.status(200).json(metrics);
});

/**
 * Process a webhook event asynchronously
 * @param {string} event - The webhook event name
 * @param {string} action - The webhook action
 * @param {Object} payload - The webhook payload
 * @param {string} deliveryId - The GitHub delivery ID
 */
async function processWebhook(event, action, payload, deliveryId) {
  try {
    // Generate a unique identifier for this webhook
    const prNumber = payload.pull_request?.number || 'unknown';
    const mergeCommitSha = payload.pull_request?.merge_commit_sha || '';
    const webhookId = `${event}.${action}.${deliveryId}.${prNumber}.${mergeCommitSha}`;
    const webhookHash = crypto.createHash('md5').update(webhookId).digest('hex');
      
    // Check if we've already processed this webhook
    if (processedWebhooks.has(webhookHash)) {
      logger.info(`Skipping duplicate webhook: ${webhookId} (${webhookHash})`);
      return;
    }
      
    // Add to processed set before processing
    processedWebhooks.add(webhookHash);
    logger.info(`Processing ${event}.${action || 'unknown'} webhook (${deliveryId || 'no-id'})`);
      
    if (event === 'pull_request') {
      if (action === 'closed' && payload.pull_request && payload.pull_request.merged === true) {
        logger.info(`Processing merged pull request #${payload.pull_request.number}`);
        await handlePullRequest({ payload });
      } else {
        logger.info(`Skipping non-merged pull request #${payload.pull_request?.number || 'unknown'}`);
      }
    } else if (event === 'protected_branch' && action === 'policy_override') {
      logger.info('Received protected_branch.policy_override event');
    } else {
      logger.info(`No handler for ${event}.${action || 'unknown'} event`);
    }
      
    // Clean up Set periodically to prevent memory leaks
    if (processedWebhooks.size > 1000) {
      const iterator = processedWebhooks.values();
      for (let i = 0; i < 200; i++) {
        processedWebhooks.delete(iterator.next().value);
      }
    }
      
    logger.info(`Finished processing ${event}.${action || 'unknown'} webhook (${deliveryId || 'no-id'})`);
  } catch (error) {
    logger.error(`Error processing ${event}.${action || 'unknown'} webhook: ${error.message}`);
    logger.error(error.stack);
  }
}
// Start the server
function startServer() {
  const server = app.listen(port, '0.0.0.0', async () => {
    logger.info(`Server started on port ${port}`);
    
    if (nodeEnv === 'production') {
      logger.info('Running in production mode');
    } else {
      logger.info(`Running in ${nodeEnv} mode`);
      
      const { webhookProxyUrl } = getGitHubCredentials();
      if (!webhookProxyUrl) {
        logger.warn('No WEBHOOK_PROXY_URL configured in .env file. Webhook forwarding not enabled.');
        logger.info('For local development, create a Smee channel at https://smee.io/new');
        logger.info('Then add WEBHOOK_PROXY_URL=your-smee-url to your .env file');
      }
      
      logger.info('Configure your GitHub App to send webhooks to this server');
      logger.info(webhookProxyUrl ? 
        `Webhook URL: ${webhookProxyUrl} (forwarded to localhost:${port}/webhook)` : 
        `Webhook URL: https://your-deployed-app.com/webhook`);
    }
  });

  return server;
}

// Start server if this file is run directly (not imported)
const server = startServer();

// Export server for testing
export default server;