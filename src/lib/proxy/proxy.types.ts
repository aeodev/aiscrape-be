/**
 * Proxy Types
 * Type definitions for the proxy management system
 */

/**
 * Proxy protocol enumeration
 */
export enum ProxyProtocol {
  HTTP = 'http',
  HTTPS = 'https',
  SOCKS4 = 'socks4',
  SOCKS5 = 'socks5',
}

/**
 * Proxy status enumeration
 */
export enum ProxyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  UNHEALTHY = 'unhealthy',
  BANNED = 'banned',
}

/**
 * Proxy rotation strategy enumeration
 */
export enum ProxyRotationStrategy {
  ROUND_ROBIN = 'round_robin',
  RANDOM = 'random',
  WEIGHTED = 'weighted',
  LEAST_USED = 'least_used',
}

/**
 * Proxy interface
 */
export interface Proxy {
  id: string;
  url: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  status: ProxyStatus;
  lastChecked?: number;
  lastUsed?: number;
  successCount: number;
  failureCount: number;
  responseTime?: number;
  averageResponseTime?: number;
  consecutiveFailures: number;
  createdAt: number;
}

/**
 * Proxy pool configuration
 */
export interface ProxyPoolConfig {
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
  maxConsecutiveFailures?: number;
  rotationStrategy?: ProxyRotationStrategy;
}

/**
 * Proxy health check result
 */
export interface ProxyHealthResult {
  proxy: Proxy;
  healthy: boolean;
  responseTime?: number;
  error?: string;
}

/**
 * Proxy statistics
 */
export interface ProxyStats {
  total: number;
  active: number;
  inactive: number;
  unhealthy: number;
  banned: number;
  averageResponseTime: number;
  totalRequests: number;
  successRate: number;
}




