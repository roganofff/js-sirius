module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
      'routes/**/*.js',
      'middleware/**/*.js',
      '!node_modules/**',
    ],
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    verbose: true,
    forceExit: true,
    clearMocks: true,
  };
  