/**
 * Circuit Breaker Manager
 * Circuit breaker implementation using opossum library
 */

import CircuitBreakerLib from 'opossum';
import { EventEmitter } from 'events';
import {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
  CircuitBreakerEvent,
} from './circuit-breaker.types';

export class CircuitBreaker extends EventEmitter {
  private breaker: InstanceType<typeof CircuitBreakerLib>;
  private config: Required<CircuitBreakerConfig>;
  private failures: number = 0;
  private successes: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: number;

  constructor(
    fn: (...args: any[]) => Promise<any>,
    config?: CircuitBreakerConfig
  ) {
    super();

    this.config = {
      timeout: config?.timeout || 10000,
      errorThresholdPercentage: config?.errorThresholdPercentage || 50,
      resetTimeout: config?.resetTimeout || 30000,
      monitoringPeriod: config?.monitoringPeriod || 60000,
      minimumRequests: config?.minimumRequests || 5,
      enabled: config?.enabled !== false,
    };

    const options: any = {
      timeout: this.config.timeout,
      errorThresholdPercentage: this.config.errorThresholdPercentage,
      resetTimeout: this.config.resetTimeout,
      rollingCountTimeout: this.config.monitoringPeriod,
      rollingCountBuckets: 10,
      name: 'CircuitBreaker',
      enabled: this.config.enabled,
    };

    this.breaker = new CircuitBreakerLib(fn, options);

    // Track statistics
    this.breaker.on('success', () => {
      this.successes++;
      this.totalRequests++;
      this.emit(CircuitBreakerEvent.SUCCESS);
    });

    this.breaker.on('failure', () => {
      this.failures++;
      this.totalRequests++;
      this.lastFailureTime = Date.now();
      this.emit(CircuitBreakerEvent.FAILURE);
    });

    this.breaker.on('open', () => {
      this.emit(CircuitBreakerEvent.OPEN);
      this.emit('stateChange', CircuitState.OPEN);
    });

    this.breaker.on('halfOpen', () => {
      this.emit(CircuitBreakerEvent.HALF_OPEN);
      this.emit('stateChange', CircuitState.HALF_OPEN);
    });

    this.breaker.on('close', () => {
      this.emit(CircuitBreakerEvent.CLOSE);
      this.emit('stateChange', CircuitState.CLOSED);
    });
  }

  /**
   * Execute function through circuit breaker
   */
  async execute(...args: any[]): Promise<any> {
    if (!this.config.enabled) {
      // If disabled, execute function directly without circuit breaker protection
      return await this.breaker.fire(...args);
    }

    try {
      return await this.breaker.fire(...args);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    if (!this.config.enabled) {
      return CircuitState.CLOSED;
    }

    const state = this.breaker.opened ? CircuitState.OPEN :
                  this.breaker.halfOpen ? CircuitState.HALF_OPEN :
                  CircuitState.CLOSED;
    return state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    const state = this.getState();
    const errorRate = this.totalRequests > 0
      ? (this.failures / this.totalRequests) * 100
      : 0;

    const nextAttempt = state === CircuitState.OPEN && this.lastFailureTime
      ? this.lastFailureTime + this.config.resetTimeout
      : undefined;

    return {
      state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      nextAttempt,
      errorRate,
    };
  }

  /**
   * Manually open circuit
   */
  open(): void {
    this.breaker.open();
  }

  /**
   * Manually close circuit
   */
  close(): void {
    this.breaker.close();
  }

  /**
   * Manually half-open circuit
   */
  halfOpen(): void {
    // Opossum doesn't have a direct halfOpen() method, it transitions automatically
    // Force transition by closing and then the breaker will go to half-open on next request
    (this.breaker as any).close();
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.breaker.close();
  }

  /**
   * Enable circuit breaker
   */
  enable(): void {
    this.config.enabled = true;
    this.breaker.enable();
  }

  /**
   * Disable circuit breaker
   */
  disable(): void {
    this.config.enabled = false;
    this.breaker.disable();
  }

  /**
   * Set fallback function
   */
  setFallback(fn: (...args: any[]) => Promise<any>): void {
    (this.breaker as any).fallback(fn);
  }
}

/**
 * Create a circuit breaker wrapper for a function
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config?: CircuitBreakerConfig
): CircuitBreaker {
  return new CircuitBreaker(fn, config);
}

