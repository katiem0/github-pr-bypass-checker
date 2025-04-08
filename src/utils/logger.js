import fs from 'fs';
import path from 'path';

// Get environment variables for logging configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_TO_FILE = process.env.LOG_TO_FILE === 'true';
const LOG_FILE = process.env.LOG_FILE || 'app.log';

// Define log levels with numeric values for comparison
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Create logger with appropriate methods
const logger = {
  debug: (message) => {
    if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.debug) {
      console.debug(`DEBUG: ${message}`);
      if (LOG_TO_FILE) {
        try {
          fs.appendFileSync(LOG_FILE, `DEBUG: ${message}\n`);
        } catch (err) {
          console.error(`Error writing to log file: ${err.message}`);
        }
      }
    }
  },
  
  info: (message) => {
    if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.info) {
      console.log(`INFO: ${message}`);
      if (LOG_TO_FILE) {
        try {
          fs.appendFileSync(LOG_FILE, `INFO: ${message}\n`);
        } catch (err) {
          console.error(`Error writing to log file: ${err.message}`);
        }
      }
    }
  },
  
  warn: (message) => {
    if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.warn) {
      console.warn(`WARN: ${message}`);
      if (LOG_TO_FILE) {
        try {
          fs.appendFileSync(LOG_FILE, `WARN: ${message}\n`);
        } catch (err) {
          console.error(`Error writing to log file: ${err.message}`);
        }
      }
    }
  },
  
  error: (message) => {
    if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.error) {
      console.error(`ERROR: ${message}`);
      if (LOG_TO_FILE) {
        try {
          fs.appendFileSync(LOG_FILE, `ERROR: ${message}\n`);
        } catch (err) {
          console.error(`Error writing to log file: ${err.message}`);
        }
      }
    }
  }
};

export default logger;