const fs = require('fs');

const logger = {
    info: (message) => {
        console.log(`INFO: ${message}`);
        // Optionally write to a log file
        fs.appendFileSync('app.log', `INFO: ${message}\n`);
    },
    warn: (message) => {
        console.warn(`WARN: ${message}`);
        // Optionally write to a log file
        fs.appendFileSync('app.log', `WARN: ${message}\n`);
    },
    error: (message) => {
        console.error(`ERROR: ${message}`);
        // Optionally write to a log file
        fs.appendFileSync('app.log', `ERROR: ${message}\n`);
    }
};

module.exports = logger;