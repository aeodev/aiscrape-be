/**
 * Jest Test Setup
 * Global test configuration and setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.CACHE_MODE = 'enabled';
process.env.CACHE_TTL = '3600';

// Suppress console logs during tests (optional, uncomment if needed)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

