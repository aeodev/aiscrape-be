/**
 * Proxy Pool
 * Manages a pool of proxies with rotation strategies
 */

import { Proxy, ProxyStatus, ProxyRotationStrategy } from './proxy.types';

export class ProxyPool {
  private proxies: Map<string, Proxy> = new Map();
  private roundRobinIndex: number = 0;
  private readonly maxConsecutiveFailures: number;

  constructor(maxConsecutiveFailures: number = 5) {
    this.maxConsecutiveFailures = maxConsecutiveFailures;
  }

  /**
   * Add a proxy to the pool
   */
  add(proxy: Proxy): void {
    this.proxies.set(proxy.id, proxy);
  }

  /**
   * Remove a proxy from the pool
   */
  remove(id: string): boolean {
    return this.proxies.delete(id);
  }

  /**
   * Get a proxy by ID
   */
  get(id: string): Proxy | undefined {
    return this.proxies.get(id);
  }

  /**
   * Get all proxies
   */
  getAll(): Proxy[] {
    return Array.from(this.proxies.values());
  }

  /**
   * Get proxies by status
   */
  getByStatus(status: ProxyStatus): Proxy[] {
    return this.getAll().filter(proxy => proxy.status === status);
  }

  /**
   * Get active proxies only
   */
  getActive(): Proxy[] {
    return this.getByStatus(ProxyStatus.ACTIVE);
  }

  /**
   * Update a proxy
   */
  updateProxy(id: string, updates: Partial<Proxy>): boolean {
    const proxy = this.proxies.get(id);
    if (!proxy) {
      return false;
    }

    this.proxies.set(id, { ...proxy, ...updates });
    return true;
  }

  /**
   * Get next proxy based on rotation strategy
   */
  getNext(strategy: ProxyRotationStrategy = ProxyRotationStrategy.ROUND_ROBIN): Proxy | null {
    const activeProxies = this.getActive();
    
    if (activeProxies.length === 0) {
      return null;
    }

    switch (strategy) {
      case ProxyRotationStrategy.ROUND_ROBIN:
        return this.getRoundRobin(activeProxies);
      
      case ProxyRotationStrategy.RANDOM:
        return this.getRandom(activeProxies);
      
      case ProxyRotationStrategy.WEIGHTED:
        return this.getWeighted(activeProxies);
      
      case ProxyRotationStrategy.LEAST_USED:
        return this.getLeastUsed(activeProxies);
      
      default:
        return this.getRoundRobin(activeProxies);
    }
  }

  /**
   * Round-robin selection
   */
  private getRoundRobin(proxies: Proxy[]): Proxy {
    const proxy = proxies[this.roundRobinIndex % proxies.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % proxies.length;
    return proxy;
  }

  /**
   * Random selection
   */
  private getRandom(proxies: Proxy[]): Proxy {
    const index = Math.floor(Math.random() * proxies.length);
    return proxies[index];
  }

  /**
   * Weighted selection based on success rate
   */
  private getWeighted(proxies: Proxy[]): Proxy {
    if (proxies.length === 1) {
      return proxies[0];
    }

    // Calculate weights based on success rate
    const weights = proxies.map(proxy => {
      const total = proxy.successCount + proxy.failureCount;
      if (total === 0) {
        return 1; // Default weight for unused proxies
      }
      const successRate = proxy.successCount / total;
      return successRate;
    });

    // Normalize weights
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);

    // Select based on weighted random
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < proxies.length; i++) {
      cumulative += normalizedWeights[i];
      if (random <= cumulative) {
        return proxies[i];
      }
    }

    // Fallback to last proxy
    return proxies[proxies.length - 1];
  }

  /**
   * Least used selection
   */
  private getLeastUsed(proxies: Proxy[]): Proxy {
    return proxies.reduce((least, current) => {
      const leastTotal = (least.successCount || 0) + (least.failureCount || 0);
      const currentTotal = (current.successCount || 0) + (current.failureCount || 0);
      
      if (currentTotal < leastTotal) {
        return current;
      }
      
      // If equal, prefer the one with better success rate
      if (currentTotal === leastTotal) {
        const leastRate = leastTotal > 0 ? least.successCount / leastTotal : 0;
        const currentRate = currentTotal > 0 ? current.successCount / currentTotal : 0;
        return currentRate >= leastRate ? current : least;
      }
      
      return least;
    });
  }

  /**
   * Mark proxy as used
   */
  markUsed(id: string): void {
    this.updateProxy(id, { lastUsed: Date.now() });
  }

  /**
   * Mark proxy success
   */
  markSuccess(id: string, responseTime?: number): void {
    const proxy = this.proxies.get(id);
    if (!proxy) {
      return;
    }

    const newSuccessCount = proxy.successCount + 1;
    const totalRequests = newSuccessCount + proxy.failureCount;
    const averageResponseTime = responseTime
      ? ((proxy.averageResponseTime || 0) * (totalRequests - 1) + responseTime) / totalRequests
      : proxy.averageResponseTime;

    this.updateProxy(id, {
      successCount: newSuccessCount,
      consecutiveFailures: 0,
      status: ProxyStatus.ACTIVE,
      responseTime,
      averageResponseTime,
      lastUsed: Date.now(),
    });
  }

  /**
   * Mark proxy failure
   */
  markFailure(id: string): void {
    const proxy = this.proxies.get(id);
    if (!proxy) {
      return;
    }

    const newFailureCount = proxy.failureCount + 1;
    const consecutiveFailures = proxy.consecutiveFailures + 1;
    
    let newStatus = proxy.status;
    if (consecutiveFailures >= this.maxConsecutiveFailures) {
      newStatus = ProxyStatus.UNHEALTHY;
    }

    this.updateProxy(id, {
      failureCount: newFailureCount,
      consecutiveFailures,
      status: newStatus,
      lastUsed: Date.now(),
    });
  }

  /**
   * Clear all proxies
   */
  clear(): void {
    this.proxies.clear();
    this.roundRobinIndex = 0;
  }

  /**
   * Get pool size
   */
  size(): number {
    return this.proxies.size;
  }

  /**
   * Check if pool is empty
   */
  isEmpty(): boolean {
    return this.proxies.size === 0;
  }
}




