/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/src/parser/**/*.test.ts',
    '<rootDir>/src/workspace/**/*.test.ts',
    '<rootDir>/src/state/**/*.test.ts',
    '<rootDir>/src/tree/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/test/vscode-mock.ts'
  },
  collectCoverageFrom: [
    'src/parser/**/*.ts',
    'src/workspace/**/*.ts',
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    './src/parser/': {
      statements: 90
    }
  }
};
