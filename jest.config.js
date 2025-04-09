export default {
  transform: {},
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  transformIgnorePatterns: [
    "/node_modules/(?!node-fetch)/"
  ],
  automock: false,
  resetMocks: false,
  restoreMocks: false,
  setupFilesAfterEnv: ['<rootDir>/tests/setup-test.js'],
  moduleNameMapper: {
    "^@octokit/(.*)$": "<rootDir>/tests/__mocks__/@octokit/$1.js"
  }
};