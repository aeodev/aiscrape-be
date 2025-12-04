/**
 * Proxy Health Checker
 * Checks proxy health by making test requests
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Proxy, ProxyHealthResult, ProxyProtocol } from './proxy.types';

export class ProxyHealthChecker {
  private readonly testUrl: string;
  private readonly defaultTimeout: number;

  constructor(testUrl: string = 'https://httpbin.org/ip', defaultTimeout: number = 10000) {
    this.testUrl = testUrl;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Check health of a single proxy
   */
  async checkHealth(proxy: Proxy, timeout?: number): Promise<ProxyHealthResult> {
    const startTime = Date.now();
    const checkTimeout = timeout || this.defaultTimeout;

    try {
      const testUrl = new URL(this.testUrl);
      
      // For HTTP/HTTPS proxies, use Node.js built-in proxy support via environment variables
      // For SOCKS proxies, we'll mark as unsupported for now
      if (proxy.protocol === ProxyProtocol.SOCKS4 || proxy.protocol === ProxyProtocol.SOCKS5) {
        return {
          proxy,
          healthy: false,
          error: `SOCKS proxy support requires additional libraries`,
        };
      }

      // Create request options with proxy
      const requestOptions: any = {
        hostname: testUrl.hostname,
        port: testUrl.port || (testUrl.protocol === 'https:' ? 443 : 80),
        path: testUrl.pathname + testUrl.search,
        method: 'GET',
        timeout: checkTimeout,
        headers: {
          'User-Agent': 'AIScrape-ProxyHealthCheck/1.0',
        },
      };

      // Set proxy via environment variable for this request
      // Note: This is a simplified approach. In production, use http-proxy-agent/https-proxy-agent
      const originalHttpProxy = process.env.HTTP_PROXY;
      const originalHttpsProxy = process.env.HTTPS_PROXY;
      
      try {
        if (testUrl.protocol === 'https:') {
          process.env.HTTPS_PROXY = proxy.url;
        } else {
          process.env.HTTP_PROXY = proxy.url;
        }

        // Make request
        const response = await this.makeRequest(requestOptions, testUrl.protocol === 'https:', checkTimeout);
        const responseTime = Date.now() - startTime;

        return {
          proxy,
          healthy: response.statusCode === 200,
          responseTime,
          error: response.statusCode !== 200 ? `HTTP ${response.statusCode}` : undefined,
        };
      } finally {
        // Restore original proxy settings
        if (originalHttpProxy !== undefined) {
          process.env.HTTP_PROXY = originalHttpProxy;
        } else {
          delete process.env.HTTP_PROXY;
        }
        if (originalHttpsProxy !== undefined) {
          process.env.HTTPS_PROXY = originalHttpsProxy;
        } else {
          delete process.env.HTTPS_PROXY;
        }
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      return {
        proxy,
        healthy: false,
        responseTime,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Check health of multiple proxies concurrently
   */
  async checkHealthBatch(proxies: Proxy[], timeout?: number, concurrency: number = 5): Promise<ProxyHealthResult[]> {
    const results: ProxyHealthResult[] = [];
    
    for (let i = 0; i < proxies.length; i += concurrency) {
      const batch = proxies.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(proxy => this.checkHealth(proxy, timeout))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Make HTTP/HTTPS request
   */
  private makeRequest(options: any, isHttps: boolean, timeout: number): Promise<{ statusCode: number }> {
    return new Promise((resolve, reject) => {
      const requestModule = isHttps ? https : http;
      
      const req = requestModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 200 });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.setTimeout(timeout);
      req.end();
    });
  }
}

