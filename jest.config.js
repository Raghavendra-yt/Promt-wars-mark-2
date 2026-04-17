/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js',
  ],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/index.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'tests/coverage-report',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
    },
  },
  testTimeout: 15000,
  verbose: true,
};
