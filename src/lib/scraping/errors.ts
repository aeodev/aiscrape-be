/**
 * Scraping Error Handling
 * Common network errors and retry strategies
 */

export enum ScrapingErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  BLOCKED = 'BLOCKED',
  CAPTCHA = 'CAPTCHA',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  NOT_FOUND = 'NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface ScrapingError {
  type: ScrapingErrorType;
  message: string;
  statusCode?: number;
  retryable: boolean;
  retryAfter?: number; // milliseconds
}

/**
 * Classify an error and provide retry guidance
 */
export function classifyError(error: any, statusCode?: number): ScrapingError {
  const message = error.message || error.toString();
  const code = statusCode || error.response?.status;

  // Timeout errors
  if (
    message.includes('timeout') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ESOCKETTIMEDOUT')
  ) {
    return {
      type: ScrapingErrorType.TIMEOUT,
      message: 'Request timed out',
      statusCode: code,
      retryable: true,
      retryAfter: 5000,
    };
  }

  // Network errors
  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ECONNRESET') ||
    message.includes('ENOTFOUND') ||
    message.includes('EAI_AGAIN') ||
    message.includes('network')
  ) {
    return {
      type: ScrapingErrorType.NETWORK_ERROR,
      message: 'Network connection failed',
      statusCode: code,
      retryable: true,
      retryAfter: 3000,
    };
  }

  // Status code based errors
  if (code) {
    // Rate limited
    if (code === 429) {
      return {
        type: ScrapingErrorType.RATE_LIMITED,
        message: 'Rate limited by server',
        statusCode: code,
        retryable: true,
        retryAfter: 60000, // Wait 1 minute
      };
    }

    // Auth required
    if (code === 401 || code === 403) {
      // Check if it's a block vs auth issue
      if (
        message.includes('captcha') ||
        message.includes('blocked') ||
        message.includes('banned')
      ) {
        return {
          type: ScrapingErrorType.BLOCKED,
          message: 'Request blocked by server',
          statusCode: code,
          retryable: false,
        };
      }
      return {
        type: ScrapingErrorType.AUTH_REQUIRED,
        message: 'Authentication required',
        statusCode: code,
        retryable: false,
      };
    }

    // Not found
    if (code === 404) {
      return {
        type: ScrapingErrorType.NOT_FOUND,
        message: 'Page not found',
        statusCode: code,
        retryable: false,
      };
    }

    // Server errors
    if (code >= 500) {
      return {
        type: ScrapingErrorType.SERVER_ERROR,
        message: 'Server error',
        statusCode: code,
        retryable: true,
        retryAfter: 10000,
      };
    }
  }

  // Captcha detection
  if (
    message.includes('captcha') ||
    message.includes('recaptcha') ||
    message.includes('hcaptcha') ||
    message.includes('challenge')
  ) {
    return {
      type: ScrapingErrorType.CAPTCHA,
      message: 'CAPTCHA detected',
      statusCode: code,
      retryable: false,
    };
  }

  // Bot detection / blocking
  if (
    message.includes('blocked') ||
    message.includes('banned') ||
    message.includes('denied') ||
    message.includes('cloudflare') ||
    message.includes('access denied')
  ) {
    return {
      type: ScrapingErrorType.BLOCKED,
      message: 'Request blocked',
      statusCode: code,
      retryable: false,
    };
  }

  // Parse errors
  if (
    message.includes('parse') ||
    message.includes('JSON') ||
    message.includes('syntax')
  ) {
    return {
      type: ScrapingErrorType.PARSE_ERROR,
      message: 'Failed to parse response',
      statusCode: code,
      retryable: false,
    };
  }

  // Unknown error
  return {
    type: ScrapingErrorType.UNKNOWN,
    message: message || 'Unknown error',
    statusCode: code,
    retryable: true,
    retryAfter: 5000,
  };
}

/**
 * Determine if we should retry based on error
 */
export function shouldRetry(error: ScrapingError, attemptCount: number, maxRetries: number): boolean {
  if (attemptCount >= maxRetries) return false;
  return error.retryable;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(
  error: ScrapingError,
  attemptCount: number,
  baseDelay: number = 1000
): number {
  // Use error's suggested delay if available
  if (error.retryAfter) {
    return error.retryAfter;
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attemptCount);
  const jitter = Math.random() * 1000;
  
  return Math.min(exponentialDelay + jitter, 60000); // Max 1 minute
}

/**
 * Retry wrapper for async functions
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    onRetry?: (error: ScrapingError, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;
  let lastError: ScrapingError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = classifyError(error);

      if (!shouldRetry(lastError, attempt, maxRetries)) {
        throw error;
      }

      const delay = calculateRetryDelay(lastError, attempt, baseDelay);
      
      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(lastError?.message || 'Max retries exceeded');
}

/**
 * Check response for common blocking patterns
 */
export function detectBlocking(html: string): ScrapingError | null {
  const lowerHtml = html.toLowerCase();

  // Cloudflare
  if (
    lowerHtml.includes('cloudflare') &&
    (lowerHtml.includes('challenge') || lowerHtml.includes('ray id'))
  ) {
    return {
      type: ScrapingErrorType.BLOCKED,
      message: 'Cloudflare protection detected',
      retryable: false,
    };
  }

  // CAPTCHA
  if (
    lowerHtml.includes('recaptcha') ||
    lowerHtml.includes('hcaptcha') ||
    lowerHtml.includes('captcha')
  ) {
    return {
      type: ScrapingErrorType.CAPTCHA,
      message: 'CAPTCHA required',
      retryable: false,
    };
  }

  // Access denied pages
  if (
    lowerHtml.includes('access denied') ||
    lowerHtml.includes('permission denied') ||
    lowerHtml.includes('forbidden')
  ) {
    return {
      type: ScrapingErrorType.BLOCKED,
      message: 'Access denied',
      retryable: false,
    };
  }

  // Bot detection
  if (
    lowerHtml.includes('bot detected') ||
    lowerHtml.includes('automated access') ||
    lowerHtml.includes('unusual traffic')
  ) {
    return {
      type: ScrapingErrorType.BLOCKED,
      message: 'Bot detected',
      retryable: false,
    };
  }

  return null;
}

