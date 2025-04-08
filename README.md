# GitHub Ruleset Bypass Checker

## Overview

The GitHub Ruleset Checker is a GitHub App designed to monitor pull requests and detect when ruleset protections have been bypassed at the repository level. When bypasses occur, the app automatically comments on pull requests with details about the bypassed rules, providing transparency and accountability for your organization's governance policies.

## Features

- Detects repository ruleset bypasses
- Provides detailed information about bypassed rules including who performed the bypass
- Automatically comments on pull requests with links to GitHub's ruleset insights pages
- Works with GitHub Enterprise Cloud and GitHub.com
- Multiple deployment options (Heroku, AWS, Azure, self-hosted)
- Development mode with Smee.io integration for local testing

### Example Pull request Comment

<img width="952" alt="Screenshot 2025-04-01 at 8 30 38 PM" src="https://github.com/user-attachments/assets/73d8515b-0c06-4f58-95dd-c2e553ada77d" />

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- A GitHub account with permissions to create GitHub Apps
- If using local development: ngrok, Smee.io, or another webhook forwarding service

### Setting up the GitHub App

1. Go to your GitHub organization settings (or personal settings)
2. Select "GitHub Apps" under "Developer settings"
3. Click "New GitHub App"
4. Fill in the required information:
   - App name: `Ruleset Bypass Checker` (or your preferred name)
   - Homepage URL: Your app's URL or GitHub repository
   - Webhook URL: Your deployed app URL (or Smee URL for dev)
   - Webhook secret: Create a secure random string
5. Set the following permissions:
   - Repository permissions:
     - Pull requests: Write
     - Administration: Read and Write
     - Metadata: Read
   - Organization permissions:
     - Administration: Read and Write
6. Subscribe to events:
   - Pull request
7. Create the App and note the App ID
8. Generate a private key and download it
9. Install the app on your organization or repositories

### Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/katiem0/github-pr-bypass-checker.git
   ```
2. Navigate to the project directory:
   ```bash
   cd github-pr-bypass-checker
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file based on the `.env.example` template:
   ```bash
   cp .env.example .env
   ```
5. Configure your `.env` file with:
   - `GITHUB_APP_ID`: Your GitHub App ID
   - `GITHUB_APP_PRIVATE_KEY`: The contents of the private key file with actual newlines
   - `INSTALLATION_ID`: The ID of your app installation (find in app settings)
   - `WEBHOOK_PROXY_URL`: A Smee.io URL for development (create at https://smee.io/new)
   - `NODE_ENV`: Set to `development`
6. For Node.js 18+, install the fetch polyfill:
   ```bash
   npm install node-fetch@2 --save
   ```
7. Start the development server:
   ```bash
   # For Node.js 16:
   npm run dev

   # For Node.js 18+:
   npm run dev:fetch
   ```
8. Optionally, run Smee client in a separate terminal:
   ```bash
   npm run smee
   ```

### Production Deployment Setup

This GitHub Ruleset Checker app can be deployed in various production environments. Follow these instructions for a reliable deployment:

### Docker Deployment

1. Build the Docker image:
   ```bash
   npm run docker:build
   ```
2. Run the container
   ```bash
   npm run docker:run
   ```
   Or manually:
   ```bash
   docker run -p 3000:3000 \
   -e NODE_ENV=production \
   -e GITHUB_APP_ID=your_app_id \
   -e GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA..." \
   -e INSTALLATION_ID=your_installation_id \
   github-pr-bypass-checker
   ```
3. Set up a reverse proxy (i.e. nginx) with `HTTPS` and point the GitHub App webhook URL at.
