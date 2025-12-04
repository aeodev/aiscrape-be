/**
 * Session & Cookie Management
 * Handle cookies and session persistence across requests
 * Enhanced with persistent file-based storage
 */

import { Cookie, Page, BrowserContext } from 'playwright';
import { FileSessionStorage } from '../session/session.storage';

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
 * Enhanced with persistent file-based storage
 */
export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private storage: FileSessionStorage;
  private initialized: boolean = false;

  constructor() {
    this.storage = new FileSessionStorage();
    this.initialize();
  }

  /**
   * Initialize session manager and load persisted sessions
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load all persisted sessions into memory
      const keys = await this.storage.listKeys();
      for (const key of keys) {
        const session = await this.storage.load(key);
        if (session) {
          this.sessions.set(key, session);
        }
      }
      console.log(`Loaded ${keys.length} persisted session(s)`);
      this.initialized = true;
    } catch (error: any) {
      console.error('Failed to initialize session manager:', error.message);
      this.initialized = true; // Continue anyway with in-memory only
    }
  }

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

    // Persist to storage
    try {
      await this.storage.save(key, session);
    } catch (error: any) {
      console.error(`Failed to persist session ${key}:`, error.message);
      // Continue anyway - session is in memory
    }

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
    await this.initialize(); // Ensure initialized

    const key = this.getSessionKey(domain, identifier);
    
    // Try memory first
    let session = this.sessions.get(key);

    // If not in memory, try loading from storage
    if (!session) {
      const loadedSession = await this.storage.load(key);
      if (loadedSession) {
        session = loadedSession;
        this.sessions.set(key, session); // Cache in memory
      } else {
        return false;
      }
    }

    if (!session) {
      return false;
    }

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      this.sessions.delete(key);
      await this.storage.delete(key);
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
   * Get a specific cookie value (async - checks storage)
   */
  async getCookie(domain: string, cookieName: string, identifier?: string): Promise<string | null> {
    await this.initialize();
    
    const key = this.getSessionKey(domain, identifier);
    
    // Try memory first
    let session = this.sessions.get(key);
    
    // If not in memory, try loading from storage
    if (!session) {
      const loadedSession = await this.storage.load(key);
      if (loadedSession) {
        session = loadedSession;
        this.sessions.set(key, session);
      } else {
        return null;
      }
    }

    if (!session) return null;

    const cookie = session.cookies.find(c => c.name === cookieName);
    return cookie?.value || null;
  }

  /**
   * Get a specific cookie value synchronously (memory only)
   */
  getCookieSync(domain: string, cookieName: string, identifier?: string): string | null {
    const key = this.getSessionKey(domain, identifier);
    const session = this.sessions.get(key);

    if (!session) return null;

    const cookie = session.cookies.find(c => c.name === cookieName);
    return cookie?.value || null;
  }

  /**
   * Check if a session exists and is valid
   */
  async hasValidSession(domain: string, identifier?: string): Promise<boolean> {
    await this.initialize(); // Ensure initialized

    const key = this.getSessionKey(domain, identifier);
    
    // Try memory first
    let session = this.sessions.get(key);
    
    // If not in memory, try loading from storage
    if (!session) {
      const loadedSession = await this.storage.load(key);
      if (loadedSession) {
        session = loadedSession;
        this.sessions.set(key, session);
      } else {
        return false;
      }
    }

    if (!session) return false;
    
    if (session.expiresAt && session.expiresAt < new Date()) {
      this.sessions.delete(key);
      await this.storage.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Check if a session exists synchronously (memory only)
   */
  hasValidSessionSync(domain: string, identifier?: string): boolean {
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
  async clearSession(domain: string, identifier?: string): Promise<void> {
    const key = this.getSessionKey(domain, identifier);
    this.sessions.delete(key);
    
    // Also delete from storage
    try {
      await this.storage.delete(key);
    } catch (error: any) {
      console.error(`Failed to delete session ${key} from storage:`, error.message);
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    this.sessions.clear();
    
    // Also clear storage
    try {
      await this.storage.clear();
    } catch (error: any) {
      console.error('Failed to clear sessions from storage:', error.message);
    }
  }

  /**
   * Clean expired sessions
   */
  async cleanExpiredSessions(): Promise<number> {
    const keys = Array.from(this.sessions.keys());
    let cleaned = 0;

    for (const key of keys) {
      const session = this.sessions.get(key);
      if (session && session.expiresAt && session.expiresAt < new Date()) {
        this.sessions.delete(key);
        await this.storage.delete(key);
        cleaned++;
      }
    }

    // Also clean storage
    const storageCleaned = await this.storage.cleanExpired();
    
    return cleaned + storageCleaned;
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    memorySessions: number;
    storageSessions: number;
    expiredSessions: number;
  }> {
    await this.initialize();
    
    const storageStats = await this.storage.getStats();
    const memoryExpired = Array.from(this.sessions.values()).filter(
      s => s.expiresAt && s.expiresAt < new Date()
    ).length;

    return {
      memorySessions: this.sessions.size,
      storageSessions: storageStats.totalSessions,
      expiredSessions: storageStats.expiredSessions + memoryExpired,
    };
  }

  /**
   * Get session data
   */
  async getSession(domain: string, identifier?: string): Promise<SessionData | null> {
    await this.initialize(); // Ensure initialized

    const key = this.getSessionKey(domain, identifier);
    
    // Try memory first
    let session = this.sessions.get(key);
    
    // If not in memory, try loading from storage
    if (!session) {
      const loadedSession = await this.storage.load(key);
      if (loadedSession) {
        session = loadedSession;
        this.sessions.set(key, session); // Cache in memory
      } else {
        return null;
      }
    }
    
    return session || null;
  }

  /**
   * Get session data synchronously (memory only)
   */
  getSessionSync(domain: string, identifier?: string): SessionData | null {
    const key = this.getSessionKey(domain, identifier);
    return this.sessions.get(key) || null;
  }

  /**
   * Convert cookies to header string (async - checks storage)
   */
  async getCookieHeader(domain: string, identifier?: string): Promise<string | null> {
    const session = await this.getSession(domain, identifier);
    if (!session || session.cookies.length === 0) return null;

    return session.cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
  }

  /**
   * Convert cookies to header string synchronously (memory only)
   */
  getCookieHeaderSync(domain: string, identifier?: string): string | null {
    const session = this.getSessionSync(domain, identifier);
    if (!session || session.cookies.length === 0) return null;

    return session.cookies
      .map((c: SessionCookie) => `${c.name}=${c.value}`)
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

