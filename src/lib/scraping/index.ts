/**
 * Scraping Utilities - Barrel Export
 * 
 * Modular utilities for advanced web scraping:
 * - Header spoofing & browser fingerprinting
 * - Session & cookie management
 * - CSRF tokens & form handling
 * - Authentication & login flows
 * - Error handling & retry strategies
 */

// Header spoofing
export {
  BrowserFingerprint,
  getRandomFingerprint,
  buildHeaders,
  getRandomHeaders,
  withReferer,
  withOrigin,
  getFormHeaders,
  getAjaxHeaders,
} from './headers';

// Session management
export {
  SessionCookie,
  SessionData,
  SessionManager,
  sessionManager,
  parseSetCookie,
} from './session';

// Form handling
export {
  FormField,
  FormData,
  extractFormData,
  extractCsrfToken,
  extractHiddenFields,
  buildFormData,
  urlEncodeFormData,
  PlaywrightFormHelper,
} from './forms';

// Authentication
export {
  LoginCredentials,
  LoginConfig,
  AuthResult,
  AuthHandler,
  buildBasicAuthHeader,
  buildBearerHeader,
  getAuthenticatedHeaders,
  withAuthentication,
} from './auth';

// Error handling
export {
  ScrapingErrorType,
  ScrapingError,
  classifyError,
  shouldRetry,
  calculateRetryDelay,
  withRetry,
  detectBlocking,
} from './errors';

