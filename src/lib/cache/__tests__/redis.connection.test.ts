/**
 * Redis Connection Tests
 * Unit tests for Redis connection manager
 */

import { redisConnection } from '../redis.connection';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('RedisConnection', () => {
  let mockRedisInstance: any;
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisInstance = {
      status: 'ready',
      on: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
    };
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedisInstance);
    process.env.REDIS_URL = originalRedisUrl || 'redis://localhost:6379';
  });

  afterEach(async () => {
    await redisConnection.disconnect();
    process.env.REDIS_URL = originalRedisUrl;
  });

  describe('getClient', () => {
    it('should return client when Redis is ready', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const client = redisConnection.getClient();
      expect(client).toBeDefined();
    });

    it('should handle connection attempts', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const client = redisConnection.getClient();
      expect(client).toBeDefined();
      expect(Redis).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return true when Redis responds to ping', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisInstance.ping.mockResolvedValue('PONG');
      mockRedisInstance.status = 'ready';
      
      const isHealthy = await redisConnection.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false when Redis ping fails', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection failed'));
      
      const isHealthy = await redisConnection.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return true when Redis is ready', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisInstance.status = 'ready';
      const available = redisConnection.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when Redis is not ready', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisInstance.status = 'end';
      const available = redisConnection.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and reset connection state', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      redisConnection.getClient();
      await redisConnection.disconnect();
      
      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });

    it('should handle disconnect when no client exists', async () => {
      await redisConnection.disconnect();
      await expect(redisConnection.disconnect()).resolves.not.toThrow();
    });
  });

  describe('event handlers', () => {
    it('should set up event handlers on connection', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      redisConnection.getClient();
      
      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });
});

