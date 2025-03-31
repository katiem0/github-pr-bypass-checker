const express = require('express');
const bodyParser = require('body-parser');
const { handlePullRequest } = require('./handlers/pullRequest');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
    const event = req.headers['x-github-event'];

    if (event === 'pull_request') {
        handlePullRequest(req.body);
    }

    res.status(200).send('Event received');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});