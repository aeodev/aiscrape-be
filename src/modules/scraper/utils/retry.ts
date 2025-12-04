/**
 * Retry utility with exponential backoff
 */

import { env } from '../../../config/env';

/**
 * Retry mechanism with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = env.MAX_RETRIES,
  baseDelay: number = env.RETRY_BACKOFF_BASE
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors (e.g., 404, 403)
      if (error.message?.includes('404') || error.message?.includes('403')) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Add random delay to mimic human behavior
 */
export async function addRandomDelay(): Promise<void> {
  if (env.REQUEST_DELAY_MIN > 0) {
    const delay = env.REQUEST_DELAY_MIN +
      Math.random() * (env.REQUEST_DELAY_MAX - env.REQUEST_DELAY_MIN);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}









