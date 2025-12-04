/**
 * Circuit Breaker Types
 * Type definitions for the circuit breaker system
 */

/**
 * Circuit breaker state enumeration
 */
export enum CircuitState {
  CLOSED = 'closed',      // Normal operation, requests pass through
  OPEN = 'open',          // Circuit is open, requests fail immediately
  HALF_OPEN = 'half_open', // Testing state, limited requests allowed
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  timeout?: number;                    // Timeout for function execution (ms)
  errorThresholdPercentage?: number;    // Error percentage threshold (0-100)
  resetTimeout?: number;                // Time before attempting half-open (ms)
  monitoringPeriod?: number;           // Time window for monitoring (ms)
  minimumRequests?: number;            // Minimum requests before opening circuit
  enabled?: boolean;                   // Enable/disable circuit breaker
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: number;
  nextAttempt?: number;
  errorRate: number;
}

/**
 * Circuit breaker event types
 */
export enum CircuitBreakerEvent {
  OPEN = 'open',
  CLOSE = 'close',
  HALF_OPEN = 'half_open',
  FAILURE = 'failure',
  SUCCESS = 'success',
}




