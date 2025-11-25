/**
 * Authentication Utilities
 * Handle login forms, basic auth, and authenticated scraping
 */

import { Page, BrowserContext } from 'playwright';
import { sessionManager, SessionData } from './session';
import { extractFormData, extractCsrfToken, PlaywrightFormHelper } from './forms';
import { getRandomHeaders, getFormHeaders, withReferer, withOrigin } from './headers';

export interface LoginCredentials {
  username: string;
  password: string;
  extraFields?: Record<string, string>;
}

export interface LoginConfig {
  loginUrl: string;
  formSelector?: string;
  usernameField?: string;
  passwordField?: string;
  submitButton?: string;
  successIndicator?: {
    type: 'url' | 'selector' | 'cookie';
    value: string;
  };
  waitAfterLogin?: number;
}

export interface AuthResult {
  success: boolean;
  session?: SessionData;
  error?: string;
  redirectUrl?: string;
}

/**
 * Default field name patterns
 */
const USERNAME_FIELDS = ['username', 'email', 'user', 'login', 'user_login', 'log'];
const PASSWORD_FIELDS = ['password', 'pass', 'pwd', 'user_pass'];

/**
 * Find the most likely username field name in a form
 */
function findUsernameField(fields: { name: string }[]): string | null {
  for (const pattern of USERNAME_FIELDS) {
    const match = fields.find(f => 
      f.name.toLowerCase().includes(pattern.toLowerCase())
    );
    if (match) return match.name;
  }
  return null;
}

/**
 * Find the most likely password field name in a form
 */
function findPasswordField(fields: { name: string }[]): string | null {
  for (const pattern of PASSWORD_FIELDS) {
    const match = fields.find(f => 
      f.name.toLowerCase().includes(pattern.toLowerCase())
    );
    if (match) return match.name;
  }
  return null;
}

/**
 * Authentication Handler - Manages login flows
 */
export class AuthHandler {
  private formHelper: PlaywrightFormHelper;

  constructor(private page: Page, private context: BrowserContext) {
    this.formHelper = new PlaywrightFormHelper(page);
  }

  /**
   * Perform a login with automatic form detection
   */
  async login(
    credentials: LoginCredentials,
    config: LoginConfig
  ): Promise<AuthResult> {
    try {
      // Navigate to login page
      await this.page.goto(config.loginUrl, { waitUntil: 'networkidle' });

      // Get form data
      const formData = await this.formHelper.getFormData(config.formSelector);
      if (!formData) {
        return { success: false, error: 'Login form not found' };
      }

      // Determine field names
      const usernameField = config.usernameField || 
        findUsernameField([...formData.fields, ...formData.hiddenFields]) ||
        'username';
      
      const passwordField = config.passwordField ||
        findPasswordField(formData.fields) ||
        'password';

      // Build form values
      const formValues: Record<string, string> = {
        [usernameField]: credentials.username,
        [passwordField]: credentials.password,
        ...credentials.extraFields,
      };

      // Fill and submit the form
      await this.formHelper.fillAndSubmit(
        config.formSelector || 'form',
        formValues,
        {
          submitButton: config.submitButton,
          waitForNavigation: true,
        }
      );

      // Wait a bit for any redirects
      if (config.waitAfterLogin) {
        await this.page.waitForTimeout(config.waitAfterLogin);
      }

      // Check for success
      const isSuccess = await this.checkLoginSuccess(config);

      if (isSuccess) {
        // Save session
        const domain = new URL(config.loginUrl).hostname;
        const session = await sessionManager.saveSession(
          domain,
          this.context,
          this.page,
          credentials.username,
          24 * 60 * 60 * 1000 // 24 hours
        );

        return {
          success: true,
          session,
          redirectUrl: this.page.url(),
        };
      }

      return {
        success: false,
        error: 'Login failed - success indicator not found',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Login failed',
      };
    }
  }

  /**
   * Check if login was successful
   */
  private async checkLoginSuccess(config: LoginConfig): Promise<boolean> {
    if (!config.successIndicator) {
      // Default: check if URL changed from login URL
      return this.page.url() !== config.loginUrl;
    }

    switch (config.successIndicator.type) {
      case 'url':
        return this.page.url().includes(config.successIndicator.value);
      
      case 'selector':
        try {
          await this.page.waitForSelector(config.successIndicator.value, {
            timeout: 5000,
          });
          return true;
        } catch {
          return false;
        }
      
      case 'cookie':
        const cookies = await this.context.cookies();
        return cookies.some(c => c.name === config.successIndicator!.value);
      
      default:
        return false;
    }
  }

  /**
   * Check if already logged in
   */
  async isLoggedIn(
    checkUrl: string,
    loggedInIndicator: { type: 'url' | 'selector' | 'cookie'; value: string }
  ): Promise<boolean> {
    await this.page.goto(checkUrl, { waitUntil: 'networkidle' });

    if (loggedInIndicator.type === 'url') {
      // Check if current URL matches the expected logged-in URL pattern
      return this.page.url().includes(loggedInIndicator.value);
    }

    if (loggedInIndicator.type === 'selector') {
      try {
        await this.page.waitForSelector(loggedInIndicator.value, { timeout: 3000 });
        return true;
      } catch {
        return false;
      }
    }

    if (loggedInIndicator.type === 'cookie') {
      const cookies = await this.context.cookies();
      return cookies.some(c => c.name === loggedInIndicator.value);
    }

    return false;
  }

  /**
   * Logout by clearing session
   */
  async logout(domain: string, identifier?: string): Promise<void> {
    sessionManager.clearSession(domain, identifier);
    await this.context.clearCookies();
  }
}

/**
 * Build Basic Auth header
 */
export function buildBasicAuthHeader(username: string, password: string): string {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Build Bearer token header
 */
export function buildBearerHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Get headers with authentication
 */
export function getAuthenticatedHeaders(
  authType: 'basic' | 'bearer',
  credentials: { username?: string; password?: string; token?: string }
): Record<string, string> {
  const headers = getRandomHeaders();

  if (authType === 'basic' && credentials.username && credentials.password) {
    headers['Authorization'] = buildBasicAuthHeader(credentials.username, credentials.password);
  } else if (authType === 'bearer' && credentials.token) {
    headers['Authorization'] = buildBearerHeader(credentials.token);
  }

  return headers;
}

/**
 * Create an authenticated scraping context
 */
export async function withAuthentication<T>(
  page: Page,
  context: BrowserContext,
  domain: string,
  credentials: LoginCredentials,
  config: LoginConfig,
  scrapeCallback: () => Promise<T>
): Promise<T> {
  const authHandler = new AuthHandler(page, context);

  // Check if we have a valid session
  if (sessionManager.hasValidSession(domain, credentials.username)) {
    // Restore session
    const restored = await sessionManager.restoreSession(
      domain,
      context,
      page,
      credentials.username
    );

    if (restored) {
      // Verify still logged in
      const stillLoggedIn = await authHandler.isLoggedIn(
        config.loginUrl.replace(/login.*$/, ''),
        config.successIndicator || { type: 'cookie', value: 'session' }
      );

      if (stillLoggedIn) {
        return await scrapeCallback();
      }
    }
  }

  // Need to login
  const result = await authHandler.login(credentials, config);

  if (!result.success) {
    throw new Error(`Authentication failed: ${result.error}`);
  }

  // Now scrape
  return await scrapeCallback();
}

