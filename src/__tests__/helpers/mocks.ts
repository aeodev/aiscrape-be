/**
 * Shared Mocks
 * Reusable mocks for testing
 */

/**
 * Mock Redis client
 */
export function createMockRedisClient() {
  const store = new Map<string, string>();
  
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    setex: jest.fn((key: string, seconds: number, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      const deleted = store.delete(key);
      return Promise.resolve(deleted ? 1 : 0);
    }),
    keys: jest.fn((pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Promise.resolve(Array.from(store.keys()).filter(k => regex.test(k)));
    }),
    ping: jest.fn(() => Promise.resolve('PONG')),
    quit: jest.fn(() => Promise.resolve('OK')),
    status: 'ready',
    clear: () => store.clear(),
  };
}

/**
 * Mock Redis connection failure
 */
export function createMockRedisFailure() {
  return {
    get: jest.fn(() => Promise.reject(new Error('Redis connection failed'))),
    set: jest.fn(() => Promise.reject(new Error('Redis connection failed'))),
    setex: jest.fn(() => Promise.reject(new Error('Redis connection failed'))),
    del: jest.fn(() => Promise.reject(new Error('Redis connection failed'))),
    keys: jest.fn(() => Promise.reject(new Error('Redis connection failed'))),
    ping: jest.fn(() => Promise.reject(new Error('Redis connection failed'))),
    status: 'end',
  };
}


