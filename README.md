# GitHub Ruleset Checker

## Overview
The GitHub Ruleset Checker is a GitHub App designed to monitor pull requests and ensure compliance with defined rulesets. If a pull request bypasses these rulesets, the app automatically comments on the pull request to notify the contributors.

## Features
- Monitors pull request events from GitHub.
- Validates pull requests against configurable rulesets.
- Automatically comments on pull requests that bypass rulesets.

## Installation
1. Clone the repository:
   ```
   git clone https://github.com/katiem0/github-ruleset-checker.git
   ```
2. Navigate to the project directory:
   ```
   cd github-ruleset-checker
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Create a `.env` file based on the `.env.example` template and fill in your GitHub App credentials.

## Usage
1. Deploy the app to a platform that supports Node.js (e.g., Heroku, AWS).
2. Configure your GitHub repository to install the app.
3. The app will start listening for pull request events and will validate them against the defined rulesets.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.