/**
 * Redis Connection Manager
 * Singleton for managing Redis connection with retry and health checks
 */

import Redis, { RedisOptions } from 'ioredis';
import { env } from '../../config/env';

class RedisConnection {
  private client: Redis | null = null;
  private isConnecting: boolean = false;
  private connectionAttempts: number = 0;
  private readonly maxConnectionAttempts: number = 5;

  /**
   * Get or create Redis client
   */
  getClient(): Redis | null {
    if (this.client && this.client.status === 'ready') {
      return this.client;
    }

    if (this.isConnecting) {
      return null;
    }

    return this.connect();
  }

  /**
   * Connect to Redis
   */
  private connect(): Redis | null {
    if (!env.REDIS_URL) {
      console.warn('Redis URL not configured, cache will use in-memory fallback');
      return null;
    }

    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      console.error('Max Redis connection attempts reached, using in-memory fallback');
      return null;
    }

    this.isConnecting = true;
    this.connectionAttempts++;

    try {
      const options: RedisOptions = {
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          console.log(`Redis retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        lazyConnect: false,
      };

      if (env.REDIS_PASSWORD) {
        options.password = env.REDIS_PASSWORD;
      }

      if (env.REDIS_DB !== undefined) {
        options.db = env.REDIS_DB;
      }

      this.client = new Redis(env.REDIS_URL, options);

      this.client.on('connect', () => {
        console.log('Redis: Connecting...');
      });

      this.client.on('ready', () => {
        console.log('Redis: Connected and ready');
        this.isConnecting = false;
        this.connectionAttempts = 0;
      });

      this.client.on('error', (error) => {
        console.error('Redis error:', error.message);
        this.isConnecting = false;
      });

      this.client.on('close', () => {
        console.log('Redis: Connection closed');
        this.isConnecting = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Redis: Reconnecting...');
      });

      return this.client;
    } catch (error: any) {
      console.error('Failed to create Redis client:', error.message);
      this.isConnecting = false;
      return null;
    }
  }

  /**
   * Health check - ping Redis server
   */
  async healthCheck(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnecting = false;
      this.connectionAttempts = 0;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    const client = this.getClient();
    return client !== null && client.status === 'ready';
  }
}

export const redisConnection = new RedisConnection();

