const express = require('express');
const bodyParser = require('body-parser');
const { handlePullRequest } = require('./handlers/pullRequest');
const logger = require('./utils/logger');
const path = require('path');
const dotenv = require('dotenv');


dotenv.config({ path: path.resolve(__dirname, '../.env') });
logger.info(`GITHUB_APP_ID from env: '${process.env.GITHUB_APP_ID}'`);
logger.info(`GITHUB_APP_PRIVATE_KEY available: ${process.env.GITHUB_APP_PRIVATE_KEY ? 'Yes' : 'No'}`);
logger.info(`WEBHOOK_PROXY_URL: ${process.env.WEBHOOK_PROXY_URL || 'Not set'}`);


const app = express();
const PORT = process.env.PORT || 3000;

(async function setupSmee() {
  try {
    const smeeUrl = process.env.WEBHOOK_PROXY_URL;
    
    if (!smeeUrl) {
      logger.warn('No WEBHOOK_PROXY_URL defined in .env, Smee client not started.');
      return;
    }
    
    // Dynamically import smee-client
    const { default: SmeeClient } = await import('smee-client');
    
    const smee = new SmeeClient({
      source: smeeUrl,
      target: `http://localhost:${PORT}/webhook`,
      logger: {
        info: message => logger.info(`[Smee] ${message}`),
        error: message => logger.error(`[Smee] ${message}`)
      }
    });

    // Start the event source
    logger.info(`Starting Smee client, forwarding ${smeeUrl} to webhook endpoint`);
    const events = smee.start();
    
    // Handle application shutdown
    process.on('SIGINT', () => {
      logger.info('Shutting down server...');
      if (events) {
        events.close();
        logger.info('Smee client closed');
      }
      process.exit(0);
    });
  } catch (error) {
    logger.error(`Failed to setup Smee client: ${error.message}`);
  }
})();

app.use(bodyParser.json());
app.get('/', (req, res) => {
  res.status(200).send('GitHub Ruleset Checker is running');
});

app.post('/webhook', (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const action = req.body.action;
    logger.info(`Received webhook: ${event}${action ? '.' + action : ''}`);
    
    if (event === 'pull_request') {
      // Pass context to handler
      handlePullRequest({ payload: req.body });
    } else if (event === 'protected_branch' && action === 'policy_override') {
      logger.info('Received protected_branch.policy_override event');
    } else if (event === 'organization') {
      if (req.body.action === 'audit_log_event') {
        logger.info('Received organization.audit_log_event event');
      }
    }
    
    // Always return 200 to GitHub
    res.status(200).send('Event received');
  } catch (error) {
    logger.error(`Error processing webhook: ${error.message}`);
    res.status(500).send('Error processing webhook');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server started on port ${PORT} and listening on 0.0.0.0`);
  logger.info(`GitHub App webhook URL: ${process.env.WEBHOOK_PROXY_URL || 'Not configured'}`);
});