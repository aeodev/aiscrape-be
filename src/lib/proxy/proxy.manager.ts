/**
 * Proxy Manager
 * Main orchestrator for proxy management system
 */

import { URL } from 'url';
import { ProxyPool } from './proxy.pool';
import { ProxyHealthChecker } from './proxy.health';
import {
  Proxy,
  ProxyStatus,
  ProxyRotationStrategy,
  ProxyProtocol,
  ProxyPoolConfig,
  ProxyStats,
} from './proxy.types';
import { env } from '../../config/env';

export class ProxyManager {
  private pool: ProxyPool;
  private healthChecker: ProxyHealthChecker;
  private healthCheckInterval?: NodeJS.Timeout;
  private config: ProxyPoolConfig;

  constructor(config?: ProxyPoolConfig) {
    this.config = {
      healthCheckInterval: config?.healthCheckInterval || 300000, // 5 minutes
      healthCheckTimeout: config?.healthCheckTimeout || 10000, // 10 seconds
      maxConsecutiveFailures: config?.maxConsecutiveFailures || 5,
      rotationStrategy: config?.rotationStrategy || ProxyRotationStrategy.ROUND_ROBIN,
    };

    this.pool = new ProxyPool(this.config.maxConsecutiveFailures);
    this.healthChecker = new ProxyHealthChecker(
      'https://httpbin.org/ip',
      this.config.healthCheckTimeout
    );

    // Initialize pool from environment variables
    this.initializeFromEnv();

    // Start auto health checking if enabled
    if (this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      this.startHealthChecking();
    }
  }

  /**
   * Initialize proxy pool from environment variables
   */
  private initializeFromEnv(): void {
    const proxyUrls = env.PROXY_URLS 
      ? env.PROXY_URLS.split(',').map(url => url.trim()).filter(Boolean)
      : env.PROXY_URL 
        ? [env.PROXY_URL]
        : [];

    for (const proxyUrl of proxyUrls) {
      try {
        const proxy = this.parseProxyUrl(proxyUrl);
        if (proxy) {
          this.pool.add(proxy);
        }
      } catch (error: any) {
        console.error(`Failed to parse proxy URL ${proxyUrl}:`, error.message);
      }
    }
  }

  /**
   * Parse proxy URL into Proxy object
   */
  private parseProxyUrl(url: string): Proxy | null {
    try {
      const parsed = new URL(url);
      const now = Date.now();

      // Determine protocol
      let protocol: ProxyProtocol;
      switch (parsed.protocol.replace(':', '').toLowerCase()) {
        case 'http':
          protocol = ProxyProtocol.HTTP;
          break;
        case 'https':
          protocol = ProxyProtocol.HTTPS;
          break;
        case 'socks4':
          protocol = ProxyProtocol.SOCKS4;
          break;
        case 'socks5':
          protocol = ProxyProtocol.SOCKS5;
          break;
        default:
          protocol = ProxyProtocol.HTTP;
      }

      // Extract credentials
      const username = parsed.username || undefined;
      const password = parsed.password || undefined;

      // Generate ID from URL
      const id = this.generateProxyId(url);

      const proxy: Proxy = {
        id,
        url,
        protocol,
        host: parsed.hostname,
        port: parseInt(parsed.port || (protocol === ProxyProtocol.HTTPS ? '443' : '80'), 10),
        username,
        password,
        status: ProxyStatus.ACTIVE,
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        createdAt: now,
      };

      return proxy;
    } catch (error: any) {
      console.error(`Error parsing proxy URL ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Generate unique ID for proxy
   */
  private generateProxyId(url: string): string {
    // Simple hash-based ID
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `proxy_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Get next available proxy
   */
  getProxy(strategy?: ProxyRotationStrategy): Proxy | null {
    const rotationStrategy = strategy || this.config.rotationStrategy || ProxyRotationStrategy.ROUND_ROBIN;
    const proxy = this.pool.getNext(rotationStrategy);
    
    if (proxy) {
      this.pool.markUsed(proxy.id);
    }
    
    return proxy;
  }

  /**
   * Mark proxy as successful
   */
  markProxySuccess(id: string, responseTime?: number): void {
    this.pool.markSuccess(id, responseTime);
  }

  /**
   * Mark proxy as failed
   */
  markProxyFailed(id: string): void {
    this.pool.markFailure(id);
  }

  /**
   * Add a new proxy
   */
  addProxy(url: string): Proxy | null {
    const proxy = this.parseProxyUrl(url);
    if (proxy) {
      this.pool.add(proxy);
      return proxy;
    }
    return null;
  }

  /**
   * Remove a proxy
   */
  removeProxy(id: string): boolean {
    return this.pool.remove(id);
  }

  /**
   * Check health of all proxies
   */
  async checkAllHealth(): Promise<void> {
    const proxies = this.pool.getAll();
    if (proxies.length === 0) {
      return;
    }

    const results = await this.healthChecker.checkHealthBatch(proxies, this.config.healthCheckTimeout);

    for (const result of results) {
      if (result.healthy) {
        this.pool.markSuccess(result.proxy.id, result.responseTime);
        this.pool.updateProxy(result.proxy.id, {
          lastChecked: Date.now(),
          status: ProxyStatus.ACTIVE,
        });
      } else {
        this.pool.markFailure(result.proxy.id);
        const proxy = this.pool.get(result.proxy.id);
        if (proxy && proxy.consecutiveFailures >= (this.config.maxConsecutiveFailures || 5)) {
          this.pool.updateProxy(result.proxy.id, {
            lastChecked: Date.now(),
            status: ProxyStatus.UNHEALTHY,
          });
        }
      }
    }
  }

  /**
   * Start automatic health checking
   */
  startHealthChecking(): void {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    // Run initial check
    this.checkAllHealth().catch(error => {
      console.error('Error in initial health check:', error);
    });

    // Schedule periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.checkAllHealth().catch(error => {
        console.error('Error in periodic health check:', error);
      });
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop automatic health checking
   */
  stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Get proxy statistics
   */
  getStats(): ProxyStats {
    const allProxies = this.pool.getAll();
    const activeProxies = this.pool.getByStatus(ProxyStatus.ACTIVE);
    const inactiveProxies = this.pool.getByStatus(ProxyStatus.INACTIVE);
    const unhealthyProxies = this.pool.getByStatus(ProxyStatus.UNHEALTHY);
    const bannedProxies = this.pool.getByStatus(ProxyStatus.BANNED);

    let totalResponseTime = 0;
    let totalRequests = 0;
    let totalSuccesses = 0;

    for (const proxy of allProxies) {
      if (proxy.averageResponseTime) {
        totalResponseTime += proxy.averageResponseTime;
      }
      totalRequests += proxy.successCount + proxy.failureCount;
      totalSuccesses += proxy.successCount;
    }

    const averageResponseTime = allProxies.length > 0
      ? totalResponseTime / allProxies.length
      : 0;

    const successRate = totalRequests > 0
      ? totalSuccesses / totalRequests
      : 0;

    return {
      total: allProxies.length,
      active: activeProxies.length,
      inactive: inactiveProxies.length,
      unhealthy: unhealthyProxies.length,
      banned: bannedProxies.length,
      averageResponseTime,
      totalRequests,
      successRate,
    };
  }

  /**
   * Get all proxies
   */
  getAllProxies(): Proxy[] {
    return this.pool.getAll();
  }

  /**
   * Get active proxies
   */
  getActiveProxies(): Proxy[] {
    return this.pool.getActive();
  }

  /**
   * Clear all proxies
   */
  clear(): void {
    this.stopHealthChecking();
    this.pool.clear();
  }
}

// Export singleton instance
export const proxyManager = new ProxyManager();



