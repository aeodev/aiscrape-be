/**
 * Session & Cookie Management
 * Handle cookies and session persistence across requests
 */

import { Cookie, Page, BrowserContext } from 'playwright';

export interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface SessionData {
  cookies: SessionCookie[];
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  createdAt: Date;
  expiresAt?: Date;
  domain: string;
}

/**
 * Session Manager - Handles cookie/session persistence
 */
export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();

  /**
   * Generate a unique session key
   */
  private getSessionKey(domain: string, identifier?: string): string {
    return identifier ? `${domain}:${identifier}` : domain;
  }

  /**
   * Extract cookies from a Playwright page
   */
  async extractCookies(context: BrowserContext): Promise<SessionCookie[]> {
    const cookies = await context.cookies();
    return cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as SessionCookie['sameSite'],
    }));
  }

  /**
   * Extract localStorage from a page
   */
  async extractLocalStorage(page: Page): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          items[key] = localStorage.getItem(key) || '';
        }
      }
      return items;
    });
  }

  /**
   * Extract sessionStorage from a page
   */
  async extractSessionStorage(page: Page): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          items[key] = sessionStorage.getItem(key) || '';
        }
      }
      return items;
    });
  }

  /**
   * Save a session
   */
  async saveSession(
    domain: string,
    context: BrowserContext,
    page: Page,
    identifier?: string,
    expiresIn?: number
  ): Promise<SessionData> {
    const cookies = await this.extractCookies(context);
    const localStorage = await this.extractLocalStorage(page);
    const sessionStorage = await this.extractSessionStorage(page);

    const session: SessionData = {
      cookies,
      localStorage,
      sessionStorage,
      createdAt: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined,
      domain,
    };

    const key = this.getSessionKey(domain, identifier);
    this.sessions.set(key, session);

    return session;
  }

  /**
   * Restore a session to a browser context
   */
  async restoreSession(
    domain: string,
    context: BrowserContext,
    page: Page,
    identifier?: string
  ): Promise<boolean> {
    const key = this.getSessionKey(domain, identifier);
    const session = this.sessions.get(key);

    if (!session) {
      return false;
    }

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      this.sessions.delete(key);
      return false;
    }

    // Restore cookies
    if (session.cookies.length > 0) {
      await context.addCookies(session.cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })));
    }

    // Restore localStorage
    if (session.localStorage && Object.keys(session.localStorage).length > 0) {
      await page.evaluate((items) => {
        for (const [key, value] of Object.entries(items)) {
          localStorage.setItem(key, value);
        }
      }, session.localStorage);
    }

    // Restore sessionStorage
    if (session.sessionStorage && Object.keys(session.sessionStorage).length > 0) {
      await page.evaluate((items) => {
        for (const [key, value] of Object.entries(items)) {
          sessionStorage.setItem(key, value);
        }
      }, session.sessionStorage);
    }

    return true;
  }

  /**
   * Get a specific cookie value
   */
  getCookie(domain: string, cookieName: string, identifier?: string): string | null {
    const key = this.getSessionKey(domain, identifier);
    const session = this.sessions.get(key);

    if (!session) return null;

    const cookie = session.cookies.find(c => c.name === cookieName);
    return cookie?.value || null;
  }

  /**
   * Check if a session exists and is valid
   */
  hasValidSession(domain: string, identifier?: string): boolean {
    const key = this.getSessionKey(domain, identifier);
    const session = this.sessions.get(key);

    if (!session) return false;
    if (session.expiresAt && session.expiresAt < new Date()) {
      this.sessions.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear a session
   */
  clearSession(domain: string, identifier?: string): void {
    const key = this.getSessionKey(domain, identifier);
    this.sessions.delete(key);
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Get session data
   */
  getSession(domain: string, identifier?: string): SessionData | null {
    const key = this.getSessionKey(domain, identifier);
    return this.sessions.get(key) || null;
  }

  /**
   * Convert cookies to header string
   */
  getCookieHeader(domain: string, identifier?: string): string | null {
    const session = this.getSession(domain, identifier);
    if (!session || session.cookies.length === 0) return null;

    return session.cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
  }
}

// Singleton instance
export const sessionManager = new SessionManager();

/**
 * Parse Set-Cookie header into SessionCookie
 */
export function parseSetCookie(setCookieHeader: string, domain: string): SessionCookie {
  const parts = setCookieHeader.split(';').map(p => p.trim());
  const [nameValue, ...attributes] = parts;
  const [name, value] = nameValue.split('=');

  const cookie: SessionCookie = {
    name,
    value,
    domain,
    path: '/',
  };

  for (const attr of attributes) {
    const [key, val] = attr.split('=').map(s => s.trim());
    const keyLower = key.toLowerCase();

    if (keyLower === 'path') cookie.path = val;
    else if (keyLower === 'domain') cookie.domain = val;
    else if (keyLower === 'expires') cookie.expires = new Date(val).getTime() / 1000;
    else if (keyLower === 'max-age') cookie.expires = Date.now() / 1000 + parseInt(val);
    else if (keyLower === 'httponly') cookie.httpOnly = true;
    else if (keyLower === 'secure') cookie.secure = true;
    else if (keyLower === 'samesite') cookie.sameSite = val as SessionCookie['sameSite'];
  }

  return cookie;
}

