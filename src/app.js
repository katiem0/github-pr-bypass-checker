const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { handlePullRequest } = require('./handlers/pullRequest');
const logger = require('./utils/logger');
const { getGitHubCredentials, getDeploymentConfig, loadEnv } = require('./utils/config');

// Load environment variables
loadEnv();

// Initialize configuration
const { port, nodeEnv } = getDeploymentConfig();
const { appId, privateKey, webhookSecret } = getGitHubCredentials();

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
    
    // Check Node.js version and set up fetch for Smee client
    const nodeVersion = process.version;
    if (nodeVersion.startsWith('v18') || nodeVersion.startsWith('v19') || nodeVersion.startsWith('v20')) {
      logger.info(`Detected Node.js ${nodeVersion} - adding fetch polyfill for Smee client`);
      // Polyfill fetch for Node.js 18+ to work with Smee client
      try {
        const nodeFetch = require('node-fetch');
        // @ts-ignore
        if (!globalThis.fetch) {
          globalThis.fetch = nodeFetch;
          globalThis.Headers = nodeFetch.Headers;
          globalThis.Request = nodeFetch.Request;
          globalThis.Response = nodeFetch.Response;
          logger.info('Successfully added fetch polyfill for Smee client');
        }
      } catch (fetchError) {
        logger.error(`Could not load node-fetch: ${fetchError.message}`);
        logger.error('Try running: npm install node-fetch@2');
      }
    }
    
    try {
      // Use require instead of dynamic import for Smee client
      const SmeeClient = require('smee-client');
      
      const smee = new SmeeClient({
        source: proxyUrl,
        target: `http://localhost:${serverPort}/webhook`,
        logger: {
          info: message => logger.info(`[Smee] ${message}`),
          error: message => logger.error(`[Smee] ${message}`)
        }
      });

      logger.info(`Starting Smee client to forward ${proxyUrl} to http://localhost:${serverPort}/webhook`);
      
      // Start the event source with retry logic
      try {
        const events = smee.start();
        logger.info('[Smee] Client started successfully');
        
        // Add explicit error handling to EventSource
        if (events && events.source) {
          events.source.onerror = function(err) {
            logger.error(`[Smee] EventSource error: ${err ? err.message || err : 'Unknown error'}`);
            
            // Try to reconnect after a delay
            setTimeout(() => {
              logger.info('[Smee] Attempting to reconnect...');
              try {
                events.close();
                const newEvents = smee.start();
                if (newEvents && newEvents.source) {
                  logger.info('[Smee] Successfully reconnected');
                  events.source = newEvents.source;
                }
              } catch (reconnectError) {
                logger.error(`[Smee] Reconnection failed: ${reconnectError.message}`);
              }
            }, 3000);
          };

          // Add message handler to log received events
          events.source.onmessage = function(message) {
            try {
              const data = JSON.parse(message.data);
              logger.info(`[Smee] Received event: ${data['x-github-event'] || 'unknown'}`);
            } catch (e) {
              logger.info('[Smee] Received message (not JSON)');
            }
          };
        }
        
        return events;
      } catch (startError) {
        logger.error(`[Smee] Error starting client: ${startError.message}`);
        
        // More detailed troubleshooting advice
        logger.error('For Node.js 18+, try running with:');
        logger.error('NODE_OPTIONS="--experimental-fetch" npm run dev');
        
        return null;
      }
    } catch (importError) {
      logger.error(`Failed to import smee-client: ${importError.message}`);
      logger.error('Make sure smee-client is installed: npm install smee-client');
      return null;
    }
  } catch (error) {
    logger.error(`Failed to setup development proxy: ${error.message}`);
    return null;
  }
}

// Configure body parser with webhook signature verification
app.use(bodyParser.json({
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
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

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    app: 'GitHub Ruleset Checker',
    version: process.env.npm_package_version || '1.0.0',
    environment: nodeEnv
  });
});

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

/**
 * Process a webhook event asynchronously
 * @param {string} event - The webhook event name
 * @param {string} action - The webhook action
 * @param {Object} payload - The webhook payload
 * @param {string} deliveryId - The GitHub delivery ID
 */
async function processWebhook(event, action, payload, deliveryId) {
  try {
      logger.info(`Processing ${event}.${action || 'unknown'} webhook (${deliveryId || 'no-id'})`);
      
      // For pull requests, only consider them when they're closed and merged
      if (event === 'pull_request') {
          // Only process merged PRs
          if (action === 'closed' && payload.pull_request && payload.pull_request.merged === true) {
              logger.info(`Processing merged pull request #${payload.pull_request.number}`);
              await handlePullRequest({ payload });
          } else {
              logger.info(`Skipping non-merged pull request #${payload.pull_request?.number || 'unknown'}`);
          }
      } else if (event === 'protected_branch' && action === 'policy_override') {
          logger.info('Received protected_branch.policy_override event');
          // Add handling for protected branch events if needed
      } else {
          logger.info(`No handler for ${event}.${action || 'unknown'} event`);
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
      
      // Check if webhook proxy is configured in development mode
      const { webhookProxyUrl } = getDeploymentConfig();
      if (webhookProxyUrl) {
        logger.info(`Starting webhook proxy with URL: ${webhookProxyUrl}`);
        await setupDevelopmentProxy(webhookProxyUrl, port);
      } else {
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
module.exports = server;