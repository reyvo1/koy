module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test', '<rootDir>/apps/user-mobile/src'],
  testRegex: '.*\.spec\.ts$',
  transform: {
    '^.+\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/artifacts/'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '\\.e2e-spec\\.ts$',
    '\\.integration-spec\\.ts$',
    '\\.mqtt-integration-spec\\.ts$',
  ],
};
